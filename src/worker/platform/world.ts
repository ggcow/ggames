// Durable Object "World" : instance unique ("main") qui détient toutes les données de la plateforme
// (SQLite intégré) et toutes les connexions temps réel (WebSockets en hibernation).
// Le Worker l'appelle par RPC ; chaque méthode authentifie elle-même le jeton de session.

import { DurableObject } from 'cloudflare:workers';
import { type GameDefinition, isAtLeastAsGood } from '../../shared/games/game.ts';
import { findGame, GAMES } from '../../shared/games/registry.ts';
import {
  type ChatMessage,
  type ClientMessage,
  cleanName,
  type GameId,
  type GameState,
  type GameSummary,
  isRunStatus,
  isValidPassword,
  LIMITS,
  PING,
  type PlayerGameDetail,
  type PlayerId,
  type PlayerInfo,
  PONG,
  type Presence,
  parseClientMessage,
  parseDuration,
  type RaceVoice,
  type Run,
  type RunStatus,
  type ServerMessage,
  type SessionResponse,
  type SubmitRunResponse,
  type VoiceNote,
} from '../../shared/platform/protocol.ts';
import { createId, createToken, hashPassword, sha256, verifyPassword } from './crypto.ts';
import { fail, ok, type Result } from './result.ts';
import { migrate } from './schema.ts';
import { PlatformStore, uniqueKey } from './store.ts';
import { ChatThrottle, LoginThrottle, ReactionThrottle } from './throttle.ts';

/** Garde-fous : plateforme entre amis à inscription libre. */
export const QUOTAS = { players: 200 } as const;

const CHAT_HISTORY = 50;
const SALON_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const RACE_VOICE_RETENTION_MS = 60 * 60 * 1000;
const VOICE_MIMES = ['audio/webm', 'audio/mp4', 'audio/ogg'] as const;

const voiceMime = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const base = value.split(';')[0]?.trim();
  return base && (VOICE_MIMES as readonly string[]).includes(base) ? base : null;
};

/** Données attachées à chaque WebSocket ; conservées pendant l'hibernation. */
interface Attachment extends Presence {
  at: number;
}

const unauthorized = (): Result<never> => fail(401, 'unauthorized');
const unknownGame = (): Result<never> => fail(404, 'unknown game');

export class World extends DurableObject<Env> {
  private readonly store: PlatformStore;
  private readonly throttle = new LoginThrottle(10, 10 * 60 * 1000);
  private readonly reactionThrottle = new ReactionThrottle(1000);
  private readonly chatThrottle = new ChatThrottle(5, 10_000);

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    migrate(ctx.storage.sql);
    this.store = new PlatformStore(ctx.storage.sql);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  /* ---------- Comptes ---------- */

  /** Crée un compte ; son pseudo affiché part de l'identifiant et se change ensuite avec `rename`. */
  async register(rawLogin: unknown, password: unknown): Promise<Result<SessionResponse>> {
    const login = cleanName(rawLogin);
    if (!login) return fail(400, 'invalid login');
    if (!isValidPassword(password)) return fail(400, 'invalid password');
    if (this.store.isLoginTaken(login)) return fail(409, 'login taken');
    if (this.store.isNameTaken(login)) return fail(409, 'name taken');
    if (this.store.countPlayers() >= QUOTAS.players) return fail(429, 'player quota reached');
    const player: PlayerInfo = { id: createId(), name: login, created: Date.now() };
    this.store.insertPlayer(player, login, await hashPassword(password));
    this.broadcast({ type: 'changed', game: null });
    return ok(await this.openSession(player));
  }

  async login(rawLogin: unknown, password: unknown): Promise<Result<SessionResponse>> {
    const login = cleanName(rawLogin);
    if (!login || typeof password !== 'string') return fail(400, 'invalid credentials');
    const account = uniqueKey(login);
    const now = Date.now();
    if (this.throttle.isBlocked(account, now)) return fail(429, 'too many attempts');
    const credentials = this.store.findCredentials(login);
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

  /** Derniers messages du salon global, limités à la fenêtre de conservation. */
  async getChat(token: unknown): Promise<Result<ChatMessage[]>> {
    if (!(await this.authenticate(token))) return unauthorized();
    const now = Date.now();
    this.store.pruneChat(now - SALON_RETENTION_MS);
    return ok(this.store.recentChat(CHAT_HISTORY, now - SALON_RETENTION_MS));
  }

  /** Notes vocales récentes du salon. */
  async getVoices(token: unknown): Promise<Result<VoiceNote[]>> {
    if (!(await this.authenticate(token))) return unauthorized();
    const now = Date.now();
    this.store.pruneVoices(now - SALON_RETENTION_MS);
    return ok(this.store.recentVoices(now - SALON_RETENTION_MS));
  }

  /** Enregistre une note vocale et la diffuse à tous les connectés. */
  async uploadVoice(token: unknown, mime: unknown, durationMs: unknown, data: unknown): Promise<Result<VoiceNote>> {
    const me = await this.authenticate(token);
    if (!me) return unauthorized();
    const type = voiceMime(mime);
    if (!type) return fail(400, 'invalid voice');
    if (
      typeof durationMs !== 'number' ||
      !Number.isInteger(durationMs) ||
      durationMs <= 0 ||
      durationMs > LIMITS.voiceDurationMs
    ) {
      return fail(400, 'invalid voice');
    }
    if (!(data instanceof ArrayBuffer) || data.byteLength === 0 || data.byteLength > LIMITS.voiceBytes) {
      return fail(400, 'invalid voice');
    }
    const now = Date.now();
    const note: VoiceNote = {
      id: createId(),
      player: me.id,
      name: me.name,
      durationMs,
      mime: type,
      at: now,
    };
    this.store.insertVoice(note, data);
    this.store.pruneVoices(now - SALON_RETENTION_MS);
    this.broadcast({ type: 'voice', note });
    return ok(note);
  }

  /** Audio d'une note, réservé aux joueurs connectés. */
  async getVoice(token: unknown, id: unknown): Promise<Result<{ mime: string; data: Uint8Array }>> {
    if (!(await this.authenticate(token))) return unauthorized();
    if (typeof id !== 'string') return fail(404, 'unknown voice');
    const meta = this.store.findVoiceMeta(id);
    if (!meta || meta.created < Date.now() - SALON_RETENTION_MS) return fail(404, 'unknown voice');
    const audio = this.store.findVoice(id);
    return audio ? ok(audio) : fail(404, 'unknown voice');
  }

  /** Notes vocales d'une course visibles par le joueur. */
  async getRaceVoices(token: unknown, gameId: unknown, key: unknown): Promise<Result<RaceVoice[]>> {
    const me = await this.authenticate(token);
    if (!me) return unauthorized();
    const game = findGame(gameId);
    if (!game || typeof key !== 'string' || !game.isValidKey(key)) return fail(400, 'invalid key');
    const now = Date.now();
    this.store.pruneRaceVoices(now - RACE_VOICE_RETENTION_MS);
    return ok(this.store.recentRaceVoices(me.id, game.id, key, now - RACE_VOICE_RETENTION_MS));
  }

  /** Enregistre une note vocale de course et la diffuse aux joueurs présents sur le niveau. */
  async uploadRaceVoice(
    token: unknown,
    gameId: unknown,
    key: unknown,
    mime: unknown,
    durationMs: unknown,
    data: unknown,
  ): Promise<Result<RaceVoice>> {
    const me = await this.authenticate(token);
    if (!me) return unauthorized();
    const game = findGame(gameId);
    if (!game || typeof key !== 'string' || !game.isValidKey(key)) return fail(400, 'invalid key');
    const type = voiceMime(mime);
    if (!type) return fail(400, 'invalid voice');
    if (
      typeof durationMs !== 'number' ||
      !Number.isInteger(durationMs) ||
      durationMs <= 0 ||
      durationMs > LIMITS.voiceDurationMs
    ) {
      return fail(400, 'invalid voice');
    }
    if (!(data instanceof ArrayBuffer) || data.byteLength === 0 || data.byteLength > LIMITS.voiceBytes) {
      return fail(400, 'invalid voice');
    }
    const present = this.playersOn(game.id, key);
    if (!present.includes(me.id)) return fail(403, 'not in race');
    const recipients = present.filter((player) => player !== me.id);
    if (recipients.length === 0) return fail(403, 'not in race');
    const now = Date.now();
    const note: RaceVoice = {
      id: createId(),
      game: game.id,
      key,
      player: me.id,
      name: me.name,
      durationMs,
      mime: type,
      at: now,
      readCount: 0,
      total: recipients.length,
      read: false,
    };
    this.store.insertRaceVoice(note, data, recipients);
    this.store.pruneRaceVoices(now - RACE_VOICE_RETENTION_MS);
    this.broadcastToKey(game.id, key, { type: 'race_voice', note });
    return ok(note);
  }

  /** Audio d'une note de course, réservé à l'auteur et aux destinataires. */
  async getRaceVoice(token: unknown, id: unknown): Promise<Result<{ mime: string; data: Uint8Array }>> {
    const me = await this.authenticate(token);
    if (!me) return unauthorized();
    if (typeof id !== 'string') return fail(404, 'unknown voice');
    const meta = this.store.findRaceVoiceMeta(id);
    if (!meta || meta.created < Date.now() - RACE_VOICE_RETENTION_MS) return fail(404, 'unknown voice');
    if (meta.player !== me.id && !this.store.isRaceVoiceRecipient(id, me.id)) return fail(404, 'unknown voice');
    const audio = this.store.findRaceVoice(id);
    return audio ? ok(audio) : fail(404, 'unknown voice');
  }

  /** Marque une note de course comme écoutée pour ce destinataire. */
  async markRaceVoiceRead(token: unknown, id: unknown): Promise<Result<{ readCount: number; total: number }>> {
    const me = await this.authenticate(token);
    if (!me) return unauthorized();
    if (typeof id !== 'string') return fail(404, 'unknown voice');
    const meta = this.store.findRaceVoiceMeta(id);
    if (!meta || meta.created < Date.now() - RACE_VOICE_RETENTION_MS) return fail(404, 'unknown voice');
    if (meta.player === me.id) return ok(this.store.raceVoiceReadCounts(id));
    if (!this.store.isRaceVoiceRecipient(id, me.id)) return fail(403, 'not in race');
    this.store.insertRaceVoiceRead(id, me.id, Date.now());
    const counts = this.store.raceVoiceReadCounts(id);
    this.broadcastToKey(meta.game, meta.key, {
      type: 'race_voice_read',
      read: { id, player: me.id, readCount: counts.readCount, total: counts.total },
    });
    if (counts.total > 0 && counts.readCount >= counts.total) this.store.deleteRaceVoice(id);
    return ok(counts);
  }

  async getPlayerDetail(token: unknown, gameId: unknown, playerId: unknown): Promise<Result<PlayerGameDetail>> {
    const me = await this.authenticate(token);
    if (!me) return unauthorized();
    const game = findGame(gameId);
    if (!game) return unknownGame();
    const player = typeof playerId === 'string' ? this.store.findPlayer(playerId) : null;
    if (!player) return fail(404, 'unknown player');
    const keys = this.store
      .keyProgress(game.id, player.id, game.scoreOrder)
      .sort((a, b) => game.compareKeys(a.key, b.key));
    const progress = this.store.progress(game.id, player.id)[0] ?? null;
    if (player.id === me.id)
      return ok({ player, progress, keys: keys.map((key) => ({ ...key, replayVisible: true })) });
    const mine = this.store.bestValues(game.id, me.id, game.scoreOrder);
    return ok({
      player,
      progress,
      // La fiche d'un ami ne liste que les niveaux réussis par les deux : les autres replays révéleraient
      // une solution, ou n'existent pas.
      keys: keys.flatMap((key) => {
        const own = mine.get(key.key);
        if (!key.best || own === undefined) return [];
        return [{ ...key, replayVisible: isAtLeastAsGood(own, key.best.value, game.scoreOrder) }];
      }),
    });
  }

  /**
   * Replay d'une partie gagnée. Celui d'un autre joueur ne se regarde qu'après avoir fait aussi bien sur le même
   * niveau : sinon, il donnerait la solution d'un niveau encore à jouer, ou une solution meilleure que la sienne.
   */
  async getRun(token: unknown, runId: unknown): Promise<Result<Run>> {
    const me = await this.authenticate(token);
    if (!me) return unauthorized();
    const run = typeof runId === 'string' ? this.store.findRun(runId) : null;
    if (run?.status !== 'won') return fail(404, 'unknown run');
    if (run.player !== me.id && !this.canWatch(me.id, run)) return fail(404, 'unknown run');
    return ok(run);
  }

  /** Vrai si `viewer` a gagné le niveau de `run` avec un score au moins aussi bon. */
  private canWatch(viewer: PlayerId, run: Run): boolean {
    const game = findGame(run.game);
    const own = game ? this.store.bestValues(game.id, viewer, game.scoreOrder).get(run.key) : undefined;
    return game !== null && own !== undefined && isAtLeastAsGood(own, run.value, game.scoreOrder);
  }

  /**
   * Enregistre une partie après l'avoir rejouée : le score retenu est celui calculé par le serveur.
   * Refusée si ni le joueur ni personne d'autre n'a débloqué la clé.
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
    if (!this.canPlay(game, me.id, key)) return fail(403, 'locked');
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
    if (msg.type === 'reaction') {
      this.react(ws, msg);
      return;
    }
    if (msg.type === 'chat') {
      this.chat(ws, msg);
      return;
    }
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

  /**
   * Un joueur peut jouer une clé que sa progression a débloquée, ou qu'un autre joueur a débloquée :
   * c'est ce qui permet de rejoindre un ami sur son niveau.
   */
  private canPlay(game: GameDefinition, player: PlayerId, key: string): boolean {
    const won = this.store.wonKeysByPlayer(game.id);
    if (game.isUnlocked(key, won.get(player) ?? new Set())) return true;
    return [...won.values()].some((keys) => game.isUnlocked(key, keys));
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

  /** Message du salon global : limité en débit, conservé quelques jours, diffusé à tous les connectés. */
  private chat(ws: WebSocket, msg: Extract<ClientMessage, { type: 'chat' }>): void {
    const current = readAttachment(ws);
    const now = Date.now();
    if (!this.chatThrottle.allow(current.player, now)) return;
    const message: ChatMessage = {
      id: createId(),
      player: current.player,
      name: current.name,
      text: msg.text,
      at: now,
    };
    this.store.insertChat(message);
    this.store.pruneChat(now - SALON_RETENTION_MS);
    this.broadcast({ type: 'chat', message });
  }

  /**
   * Réaction de course : le joueur doit être en train de jouer ce niveau, et une seule réaction passe par
   * seconde. Elle n'est diffusée qu'aux connexions présentes sur le même `(jeu, niveau)` et n'est pas stockée.
   */
  private react(ws: WebSocket, msg: Extract<ClientMessage, { type: 'reaction' }>): void {
    const current = readAttachment(ws);
    if (current.game !== msg.game || current.key !== msg.key) return;
    const game = findGame(msg.game);
    if (!game?.isValidKey(msg.key)) return;
    const now = Date.now();
    if (!this.reactionThrottle.allow(current.player, now)) return;
    this.broadcastToKey(msg.game, msg.key, {
      type: 'reaction',
      reaction: {
        game: msg.game,
        key: msg.key,
        player: current.player,
        name: current.name,
        code: msg.code,
        at: now,
      },
    });
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
      this.send(ws, data);
    }
  }

  /** Joueurs connectés sur un niveau donné, sans doublon entre leurs appareils. */
  private playersOn(game: GameId, key: string): PlayerId[] {
    const players = new Set<PlayerId>();
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = readAttachment(ws);
      if (attachment.game === game && attachment.key === key) players.add(attachment.player);
    }
    return [...players];
  }

  /** Diffuse un message aux connexions dont la présence courante est ce jeu et ce niveau. */
  private broadcastToKey(game: GameId, key: string, message: ServerMessage): void {
    const data = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = readAttachment(ws);
      if (attachment.game !== game || attachment.key !== key) continue;
      this.send(ws, data);
    }
  }

  private send(ws: WebSocket, data: string): void {
    try {
      ws.send(data);
    } catch {
      // Connexion en cours de fermeture : retirée par webSocketClose.
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
