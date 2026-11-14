// Contrat client <-> serveur de la plateforme, commun à tous les jeux :
// comptes, parties enregistrées (avec replay), progression, classements, présence en temps réel.
// Le contenu des champs `key`, `replay` et `state` est défini par chaque jeu (voir shared/games).

import { cleanText, isId, isRecord, parseJson } from './validate.ts';

export type PlayerId = string;
export type RunId = string;
export type GameId = string;

export const LIMITS = {
  name: 16,
  passwordMin: 4,
  passwordMax: 128,
  key: 40,
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

export type ClientMessage =
  | { type: 'activity'; game: GameId; key: string; state: string; value: number }
  | { type: 'idle' };

export type ServerMessage =
  | { type: 'presence'; online: Presence[] }
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

export function parseClientMessage(raw: string): ClientMessage | null {
  const msg = parseJson(raw);
  if (!isRecord(msg)) return null;
  if (msg['type'] === 'idle') return { type: 'idle' };
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

export function parseServerMessage(raw: string): ServerMessage | null {
  const msg = parseJson(raw);
  if (!isRecord(msg)) return null;
  if (msg['type'] === 'changed') {
    const game = msg['game'];
    return game === null || isGameId(game) ? { type: 'changed', game } : null;
  }
  if (msg['type'] === 'presence' && Array.isArray(msg['online'])) {
    return { type: 'presence', online: msg['online'].map(parsePresence).filter((p): p is Presence => p !== null) };
  }
  return null;
}
