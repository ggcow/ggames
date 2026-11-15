// Contrat client <-> serveur de la plateforme, commun à tous les jeux :
// comptes, parties enregistrées (avec replay), progression, classements, présence en temps réel.
// Le contenu des champs `key`, `replay` et `state` est défini par chaque jeu (voir shared/games).

import { isReactionCode, type ReactionCode } from './reactions.ts';
import { cleanText, isId, isRecord, parseJson } from './validate.ts';

export type PlayerId = string;
export type RunId = string;
export type GameId = string;

export const LIMITS = {
  name: 16,
  passwordMin: 4,
  passwordMax: 128,
  key: 40,
  chat: 500,
  voiceDurationMs: 30_000,
  voiceBytes: 1_000_000,
  replay: 20_000,
  state: 512,
  value: 1_000_000,
  durationMs: 24 * 3600 * 1000,
  body: 32_768,
} as const;

/* ---------- Données ---------- */

export interface PlayerInfo {
  id: PlayerId;
  name: string;
  created: number;
}

/** Issue d'une partie. `abandoned` : quittée avant la fin. */
export type RunStatus = 'won' | 'lost' | 'abandoned';
export const RUN_STATUSES: readonly RunStatus[] = ['won', 'lost', 'abandoned'];

/** Une partie jouée. `value` est calculée par le serveur en rejouant le replay. */
export interface RunSummary {
  id: RunId;
  game: GameId;
  /** Niveau ou mode joué (format défini par le jeu). */
  key: string;
  player: PlayerId;
  status: RunStatus;
  value: number;
  durationMs: number;
  ended: number;
}

export interface Run extends RunSummary {
  /** Suite des actions du joueur (format défini par le jeu). */
  replay: string;
}

/** Meilleure partie gagnée d'un joueur sur une clé. */
export interface RecordEntry {
  player: PlayerId;
  value: number;
  run: RunId;
}

/** Résumé de l'activité d'un joueur sur un jeu. */
export interface PlayerProgress {
  player: PlayerId;
  /** Nombre de clés (niveaux) différentes gagnées au moins une fois. */
  completed: number;
  runs: number;
  playTimeMs: number;
  lastPlayed: number;
}

export interface GameSummary {
  id: GameId;
  players: number;
  runs: number;
  lastPlayed: number | null;
}

/** Tout ce qu'un client affiche pour un jeu. */
export interface GameState {
  players: PlayerInfo[];
  progress: PlayerProgress[];
  /** Classement par clé, du meilleur au moins bon. */
  records: Record<string, RecordEntry[]>;
}

/** Détail d'un joueur sur une clé. */
export interface KeyProgress {
  key: string;
  attempts: number;
  wins: number;
  best: RunSummary | null;
  /**
   * Le demandeur peut regarder le replay de `best` : c'est sa propre fiche, ou il a fait aussi bien sur ce niveau.
   * Sinon, ce replay lui montrerait comment faire mieux.
   */
  replayVisible: boolean;
}

export interface PlayerGameDetail {
  player: PlayerInfo;
  progress: PlayerProgress | null;
  /** Niveaux consultables : tous ceux joués par le demandeur, sinon ceux réussis par les deux joueurs. */
  keys: KeyProgress[];
}

/* ---------- HTTP ---------- */

export interface CredentialsRequest {
  name: string;
  password: string;
}
export interface SessionResponse {
  player: PlayerInfo;
  token: string;
}
export interface RenameRequest {
  name: string;
}
export interface SubmitRunRequest {
  key: string;
  status: RunStatus;
  durationMs: number;
  replay: string;
}
export interface SubmitRunResponse {
  run: RunSummary;
  records: RecordEntry[];
}
export interface ErrorResponse {
  error: string;
}

export const ROUTES = {
  register: '/api/auth/register',
  login: '/api/auth/login',
  logout: '/api/auth/logout',
  me: '/api/me',
  games: '/api/games',
  live: '/api/live',
  game: (game: GameId) => `/api/games/${game}`,
  playerDetail: (game: GameId, player: PlayerId) => `/api/games/${game}/players/${player}`,
  runs: (game: GameId) => `/api/games/${game}/runs`,
  run: (id: RunId) => `/api/runs/${id}`,
  chat: '/api/chat',
  voices: '/api/voices',
  voice: (id: string) => `/api/voices/${id}`,
  raceVoices: (game: GameId, key: string) => `/api/games/${game}/voices?key=${encodeURIComponent(key)}`,
  raceVoice: (id: string) => `/api/race-voices/${id}`,
  raceVoiceRead: (id: string) => `/api/race-voices/${id}/read`,
} as const;

/* ---------- Temps réel : WebSocket sur ROUTES.live?token=... ---------- */

/** Activité d'un joueur connecté. `game`, `key` et `state` sont null quand il est dans les menus. */
export interface Presence {
  player: PlayerId;
  name: string;
  game: GameId | null;
  key: string | null;
  state: string | null;
  value: number;
}

/** Réaction de course : elle n'existe que pour les joueurs du même niveau et n'est jamais conservée. */
export interface ReactionNotice {
  game: GameId;
  key: string;
  player: PlayerId;
  name: string;
  code: ReactionCode;
  at: number;
}

/** Message du salon global, conservé quelques jours côté serveur. */
export interface ChatMessage {
  id: string;
  player: PlayerId;
  name: string;
  text: string;
  at: number;
}

/** Note vocale du salon : elle reste dans l'historique comme un message normal. */
export interface VoiceNote {
  id: string;
  player: PlayerId;
  name: string;
  durationMs: number;
  mime: string;
  at: number;
}

/** Note vocale d'une course. `read` est vrai quand le lecteur l'a déjà écoutée. */
export interface RaceVoice {
  id: string;
  game: GameId;
  key: string;
  player: PlayerId;
  name: string;
  durationMs: number;
  mime: string;
  at: number;
  readCount: number;
  total: number;
  read: boolean;
}

/** Lecture d'une note de course par un joueur, pour mettre à jour le compteur de l'auteur. */
export interface RaceVoiceRead {
  id: string;
  player: PlayerId;
  readCount: number;
  total: number;
}

export type ClientMessage =
  | { type: 'activity'; game: GameId; key: string; state: string; value: number }
  | { type: 'reaction'; game: GameId; key: string; code: ReactionCode }
  | { type: 'chat'; text: string }
  | { type: 'idle' };

export type ServerMessage =
  | { type: 'presence'; online: Presence[] }
  | { type: 'reaction'; reaction: ReactionNotice }
  | { type: 'chat'; message: ChatMessage }
  | { type: 'voice'; note: VoiceNote }
  | { type: 'race_voice'; note: RaceVoice }
  | { type: 'race_voice_read'; read: RaceVoiceRead }
  /** Des données ont changé : les clients concernés rechargent. `game` null = données de joueurs. */
  | { type: 'changed'; game: GameId | null };

/** Maintien de connexion : le serveur répond PONG sans sortir d'hibernation. */
export const PING = 'ping';
export const PONG = 'pong';

/* ---------- Validation ---------- */

export const isGameId = (value: unknown): value is GameId =>
  typeof value === 'string' && /^[a-z][a-z0-9-]{1,30}$/.test(value);

export function cleanName(value: unknown): string | null {
  const name = cleanText(value, LIMITS.name);
  return name.length > 0 ? name : null;
}

export const isValidPassword = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= LIMITS.passwordMin && value.length <= LIMITS.passwordMax;

export const isRunStatus = (value: unknown): value is RunStatus => RUN_STATUSES.includes(value as RunStatus);

export const parseDuration = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= LIMITS.durationMs ? value : null;

const isShortString = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max;

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= LIMITS.value;

const isTimestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

export function parseClientMessage(raw: string): ClientMessage | null {
  const msg = parseJson(raw);
  if (!isRecord(msg)) return null;
  if (msg['type'] === 'idle') return { type: 'idle' };
  if (msg['type'] === 'reaction') {
    const { game, key, code } = msg;
    if (!isGameId(game) || !isShortString(key, LIMITS.key) || !isReactionCode(code)) return null;
    return { type: 'reaction', game, key, code };
  }
  if (msg['type'] === 'chat') {
    const text = cleanText(msg['text'], LIMITS.chat);
    return text.length > 0 ? { type: 'chat', text } : null;
  }
  if (msg['type'] !== 'activity') return null;
  const { game, key, state, value } = msg;
  if (!isGameId(game) || !isShortString(key, LIMITS.key) || !isShortString(state, LIMITS.state) || !isCount(value)) {
    return null;
  }
  return { type: 'activity', game, key, state, value };
}

const isNullableString = (value: unknown): value is string | null => value === null || typeof value === 'string';

function parsePresence(value: unknown): Presence | null {
  if (!isRecord(value)) return null;
  const { player, name, game, key, state } = value;
  const score = value['value'];
  if (!isId(player) || typeof name !== 'string' || !isCount(score)) return null;
  if (!isNullableString(game) || !isNullableString(key) || !isNullableString(state)) return null;
  return { player, name, game, key, state, value: score };
}

function parseReaction(value: unknown): ReactionNotice | null {
  if (!isRecord(value)) return null;
  const { game, key, player, name, code } = value;
  const at = value['at'];
  if (!isGameId(game) || !isShortString(key, LIMITS.key) || !isId(player) || !isShortString(name, LIMITS.name)) {
    return null;
  }
  if (!isReactionCode(code) || !isTimestamp(at)) return null;
  return { game, key, player, name, code, at };
}

function parseChatMessage(value: unknown): ChatMessage | null {
  if (!isRecord(value)) return null;
  const { id, player, name, text } = value;
  const at = value['at'];
  if (!isId(id) || !isId(player) || !isShortString(name, LIMITS.name) || !isShortString(text, LIMITS.chat)) {
    return null;
  }
  if (text.length === 0 || !isTimestamp(at)) return null;
  return { id, player, name, text, at };
}

function parseVoiceNote(value: unknown): VoiceNote | null {
  if (!isRecord(value)) return null;
  const { id, player, name, mime } = value;
  const durationMs = value['durationMs'];
  const at = value['at'];
  if (!isId(id) || !isId(player) || !isShortString(name, LIMITS.name)) return null;
  if (!isCount(durationMs) || durationMs <= 0 || durationMs > LIMITS.voiceDurationMs) return null;
  if (typeof mime !== 'string' || !mime.startsWith('audio/') || mime.length > 40) return null;
  if (!isTimestamp(at)) return null;
  return { id, player, name, durationMs, mime, at };
}

function parseRaceVoice(value: unknown): RaceVoice | null {
  if (!isRecord(value)) return null;
  const { id, game, key, player, name, mime, read } = value;
  const durationMs = value['durationMs'];
  const at = value['at'];
  const readCount = value['readCount'];
  const total = value['total'];
  if (!isId(id) || !isGameId(game) || !isShortString(key, LIMITS.key) || !isId(player)) return null;
  if (!isShortString(name, LIMITS.name)) return null;
  if (!isCount(durationMs) || durationMs <= 0 || durationMs > LIMITS.voiceDurationMs) return null;
  if (typeof mime !== 'string' || !mime.startsWith('audio/') || mime.length > 40) return null;
  if (!isTimestamp(at) || !isCount(readCount) || !isCount(total) || typeof read !== 'boolean') return null;
  return { id, game, key, player, name, durationMs, mime, at, readCount, total, read };
}

function parseRaceVoiceRead(value: unknown): RaceVoiceRead | null {
  if (!isRecord(value)) return null;
  const { id, player, readCount, total } = value;
  if (!isId(id) || !isId(player) || !isCount(readCount) || !isCount(total)) return null;
  return { id, player, readCount, total };
}

export function parseServerMessage(raw: string): ServerMessage | null {
  const msg = parseJson(raw);
  if (!isRecord(msg)) return null;
  if (msg['type'] === 'changed') {
    const game = msg['game'];
    return game === null || isGameId(game) ? { type: 'changed', game } : null;
  }
  if (msg['type'] === 'reaction') {
    const reaction = parseReaction(msg['reaction']);
    return reaction ? { type: 'reaction', reaction } : null;
  }
  if (msg['type'] === 'chat') {
    const message = parseChatMessage(msg['message']);
    return message ? { type: 'chat', message } : null;
  }
  if (msg['type'] === 'voice') {
    const note = parseVoiceNote(msg['note']);
    return note ? { type: 'voice', note } : null;
  }
  if (msg['type'] === 'race_voice') {
    const note = parseRaceVoice(msg['note']);
    return note ? { type: 'race_voice', note } : null;
  }
  if (msg['type'] === 'race_voice_read') {
    const read = parseRaceVoiceRead(msg['read']);
    return read ? { type: 'race_voice_read', read } : null;
  }
  if (msg['type'] === 'presence' && Array.isArray(msg['online'])) {
    return { type: 'presence', online: msg['online'].map(parsePresence).filter((p): p is Presence => p !== null) };
  }
  return null;
}
