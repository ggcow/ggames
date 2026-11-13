// Durable Object "World" : instance unique ("main") qui détient toutes les données de la plateforme
// (SQLite intégré) et toutes les connexions temps réel (WebSockets en hibernation).
// Le Worker l'appelle par RPC ; chaque méthode authentifie elle-même le jeton de session.

import { DurableObject } from 'cloudflare:workers';
import type { GameDefinition } from '../../shared/games/game.ts';
import { findGame, GAMES } from '../../shared/games/registry.ts';
import {
  cleanName,
  type GameState,
  type GameSummary,
  isRunStatus,
  isValidPassword,
  LIMITS,
  PING,
  type PlayerGameDetail,
  type PlayerInfo,
  PONG,
  type Presence,
  parseClientMessage,
  parseDuration,
  type Run,
  type RunStatus,
  type ServerMessage,
  type SessionResponse,
  type SubmitRunResponse,
} from '../../shared/platform/protocol.ts';
import { createId, createToken, hashPassword, sha256, verifyPassword } from './crypto.ts';
import { fail, ok, type Result } from './result.ts';
import { migrate } from './schema.ts';
import { nameKey, PlatformStore } from './store.ts';
import { LoginThrottle } from './throttle.ts';

/** Garde-fous : plateforme entre amis à inscription libre. */
export const QUOTAS = { players: 200, recentRuns: 30 } as const;

/** Données attachées à chaque WebSocket ; conservées pendant l'hibernation. */
interface Attachment extends Presence {
  at: number;
}

const unauthorized = (): Result<never> => fail(401, 'unauthorized');
const unknownGame = (): Result<never> => fail(404, 'unknown game');

export class World extends DurableObject<Env> {
  private readonly store: PlatformStore;
  private readonly throttle = new LoginThrottle(10, 10 * 60 * 1000);

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    migrate(ctx.storage.sql);
    this.store = new PlatformStore(ctx.storage.sql);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  /* ---------- Comptes ---------- */

  async register(rawName: unknown, password: unknown): Promise<Result<SessionResponse>> {
    const name = cleanName(rawName);
    if (!name) return fail(400, 'invalid name');
    if (!isValidPassword(password)) return fail(400, 'invalid password');
    if (this.store.isNameTaken(name)) return fail(409, 'name taken');
    if (this.store.countPlayers() >= QUOTAS.players) return fail(429, 'player quota reached');
    const player: PlayerInfo = { id: createId(), name, created: Date.now() };
    this.store.insertPlayer(player, await hashPassword(password));
    this.broadcast({ type: 'changed', game: null });
    return ok(await this.openSession(player));
  }

  async login(rawName: unknown, password: unknown): Promise<Result<SessionResponse>> {
    const name = cleanName(rawName);
    if (!name || typeof password !== 'string') return fail(400, 'invalid credentials');
    const account = nameKey(name);
    const now = Date.now();
    if (this.throttle.isBlocked(account, now)) return fail(429, 'too many attempts');
    const credentials = this.store.findCredentials(name);
    if (!credentials || !(await verifyPassword(password, credentials.passwordHash))) {
      this.throttle.recordFailure(account, now);
      return fail(401, 'invalid credentials');
    }
    this.throttle.reset(account);
    return ok(await this.openSession(credentials.player));
  }

  async logout(token: unknown): Promise<Result<true>> {
    if (typeof token === 'string') this.store.deleteSession(await sha256(token));
    return ok(true);
  }

  async me(token: unknown): Promise<Result<PlayerInfo>> {
    const me = await this.authenticate(token);
    return me ? ok(me) : unauthorized();
  }

  async rename(token: unknown, rawName: unknown): Promise<Result<PlayerInfo>> {
    const me = await this.authenticate(token);
    if (!me) return unauthorized();
    const name = cleanName(rawName);
    if (!name) return fail(400, 'invalid name');
    if (this.store.isNameTaken(name, me.id)) return fail(409, 'name taken');
    this.store.renamePlayer(me.id, name);
    for (const ws of this.ctx.getWebSockets(me.id)) {
      ws.serializeAttachment({ ...readAttachment(ws), name } satisfies Attachment);
    }
    this.broadcast({ type: 'changed', game: null });
    this.broadcastPresence();
    return ok({ ...me, name });
  }

  /* ---------- Jeux ---------- */

  async listGames(token: unknown): Promise<Result<GameSummary[]>> {
    if (!(await this.authenticate(token))) return unauthorized();
    const summaries = this.store.gameSummaries();
    return ok(
      [...GAMES.keys()].map((id) => ({ id, ...(summaries.get(id) ?? { players: 0, runs: 0, lastPlayed: null }) })),
    );
  }

  async getGame(token: unknown, gameId: unknown): Promise<Result<GameState>> {
    if (!(await this.authenticate(token))) return unauthorized();
    const game = findGame(gameId);
    if (!game) return unknownGame();
    return ok({
      players: this.store.listPlayers(),
      progress: this.store.progress(game.id),
      records: this.store.records(game.id, game.scoreOrder),
    });
  }

  async getPlayerDetail(token: unknown, gameId: unknown, playerId: unknown): Promise<Result<PlayerGameDetail>> {
    if (!(await this.authenticate(token))) return unauthorized();
    const game = findGame(gameId);
    if (!game) return unknownGame();
    const player = typeof playerId === 'string' ? this.store.findPlayer(playerId) : null;
    if (!player) return fail(404, 'unknown player');
    return ok({
      player,
      progress: this.store.progress(game.id, player.id)[0] ?? null,
      keys: this.store.keyProgress(game.id, player.id, game.scoreOrder),
      recent: this.store.recentRuns(game.id, player.id, QUOTAS.recentRuns),
    });
  }

  async getRun(token: unknown, runId: unknown): Promise<Result<Run>> {
    if (!(await this.authenticate(token))) return unauthorized();
    const run = typeof runId === 'string' ? this.store.findRun(runId) : null;
    return run ? ok(run) : fail(404, 'unknown run');
  }

  /**
   * Enregistre une partie après l'avoir rejouée : le score retenu est celui calculé par le serveur.
   * Refusée si le joueur n'a pas encore débloqué la clé (prérequis non gagné).
   */
  async submitRun(
    token: unknown,
    gameId: unknown,
    key: unknown,
    status: unknown,
    durationMs: unknown,
    replay: unknown,
  ): Promise<Result<SubmitRunResponse>> {
    const me = await this.authenticate(token);
    if (!me) return unauthorized();
    const game = findGame(gameId);
    if (!game) return unknownGame();
    const duration = parseDuration(durationMs);
    if (typeof key !== 'string' || key.length > LIMITS.key || !isRunStatus(status) || duration === null) {
      return fail(400, 'invalid run');
    }
    if (!game.isValidKey(key)) return fail(400, 'invalid key');
    const required = game.prerequisite(key);
    if (required !== null && !this.store.hasWon(game.id, me.id, required)) return fail(403, 'locked');
    const run = this.verifiedRun(game, me, key, status, duration, replay);
    if (!run) return fail(400, 'invalid replay');
    this.store.insertRun(run);
    this.broadcast({ type: 'changed', game: game.id });
    const { replay: _replay, ...summary } = run;
    return ok({ run: summary, records: this.store.records(game.id, game.scoreOrder, key)[key] ?? [] });
  }

  /* ---------- Temps réel ---------- */

  /** Ouverture d'un WebSocket : `GET /api/live?token=...` avec l'en-tête `Upgrade: websocket`. */
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const me = await this.authenticate(new URL(request.url).searchParams.get('token'));
    if (!me) return new Response('unauthorized', { status: 401 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [me.id]);
    server.serializeAttachment(idleAttachment(me.id, me.name, Date.now()));
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const msg = typeof message === 'string' ? parseClientMessage(message) : null;
    if (!msg) return;
    const current = readAttachment(ws);
    const now = Date.now();
    const next: Attachment =
      msg.type === 'activity' && findGame(msg.game)
        ? { ...current, game: msg.game, key: msg.key, state: msg.state, value: msg.value, at: now }
        : idleAttachment(current.player, current.name, now);
    ws.serializeAttachment(next);
    this.broadcastPresence();
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    ws.close(code, reason);
    this.broadcastPresence(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.broadcastPresence(ws);
  }

  /* ---------- Interne ---------- */

  private async openSession(player: PlayerInfo): Promise<SessionResponse> {
    const token = createToken();
    this.store.insertSession(await sha256(token), player.id, Date.now());
    return { player, token };
  }

  private async authenticate(token: unknown): Promise<PlayerInfo | null> {
    if (typeof token !== 'string' || token.length < 32 || token.length > 128) return null;
    return this.store.useSession(await sha256(token), Date.now());
  }

  /** Rejoue la partie et construit l'enregistrement. `null` si le replay ne correspond pas au statut annoncé. */
  private verifiedRun(
    game: GameDefinition,
    player: PlayerInfo,
    key: string,
    status: RunStatus,
    durationMs: number,
    replay: unknown,
  ): Run | null {
    if (typeof replay !== 'string' || replay.length > LIMITS.replay) return null;
    const outcome = game.replay(key, replay);
    if (!outcome || outcome.finished !== (status === 'won')) return null;
    return {
      id: createId(),
      game: game.id,
      key,
      player: player.id,
      status,
      value: outcome.value,
      durationMs,
      replay,
      ended: Date.now(),
    };
  }

  /** Joueurs connectés : une entrée par joueur, sa connexion la plus récemment active. */
  private presence(exclude?: WebSocket): Presence[] {
    const latest = new Map<string, Attachment>();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      const attachment = readAttachment(ws);
      const previous = latest.get(attachment.player);
      if (!previous || attachment.at > previous.at) latest.set(attachment.player, attachment);
    }
    return [...latest.values()].map(({ at: _at, ...presence }) => presence);
  }

  private broadcastPresence(exclude?: WebSocket): void {
    this.broadcast({ type: 'presence', online: this.presence(exclude) }, exclude);
  }

  private broadcast(message: ServerMessage, exclude?: WebSocket): void {
    const data = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      try {
        ws.send(data);
      } catch {
        // Connexion en cours de fermeture : retirée par webSocketClose.
      }
    }
  }
}

const idleAttachment = (player: string, name: string, at: number): Attachment => ({
  player,
  name,
  game: null,
  key: null,
  state: null,
  value: 0,
  at,
});

const readAttachment = (ws: WebSocket): Attachment => ws.deserializeAttachment() as Attachment;
