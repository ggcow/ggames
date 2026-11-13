// Client HTTP typé de l'API. Une méthode par route ; les erreurs deviennent des ApiError.

import {
  type CredentialsRequest,
  type ErrorResponse,
  type GameId,
  type GameState,
  type GameSummary,
  type PlayerGameDetail,
  type PlayerId,
  type PlayerInfo,
  ROUTES,
  type Run,
  type RunId,
  type SessionResponse,
  type SubmitRunRequest,
  type SubmitRunResponse,
} from '../../shared/platform/protocol.ts';
import { isRecord } from '../../shared/platform/validate.ts';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Statut 0 : serveur injoignable (réseau). */
export const NETWORK_ERROR = 0;

export type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export class ApiClient {
  private readonly fetchImpl: Fetch;
  private token: string | null = null;
  private unauthorizedHandler: (() => void) | null = null;

  constructor(fetchImpl: Fetch) {
    this.fetchImpl = fetchImpl;
  }

  setToken(token: string | null): void {
    this.token = token;
  }

  /** Appelé quand le serveur refuse le jeton de session (expiré ou révoqué). */
  onUnauthorized(handler: () => void): void {
    this.unauthorizedHandler = handler;
  }

  register = (body: CredentialsRequest) => this.request<SessionResponse>('POST', ROUTES.register, body);
  login = (body: CredentialsRequest) => this.request<SessionResponse>('POST', ROUTES.login, body);
  logout = () => this.request<true>('POST', ROUTES.logout);
  me = () => this.request<PlayerInfo>('GET', ROUTES.me);
  rename = (name: string) => this.request<PlayerInfo>('PATCH', ROUTES.me, { name });
  games = () => this.request<GameSummary[]>('GET', ROUTES.games);
  game = (game: GameId) => this.request<GameState>('GET', ROUTES.game(game));
  playerDetail = (game: GameId, player: PlayerId) =>
    this.request<PlayerGameDetail>('GET', ROUTES.playerDetail(game, player));
  submitRun = (game: GameId, body: SubmitRunRequest) =>
    this.request<SubmitRunResponse>('POST', ROUTES.runs(game), body);
  run = (id: RunId) => this.request<Run>('GET', ROUTES.run(id));

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    let response: Response;
    try {
      response = await this.fetchImpl(path, init);
    } catch {
      throw new ApiError(NETWORK_ERROR, 'network');
    }
    const payload: unknown = await response.json().catch(() => null);
    if (response.status === 401 && this.token) this.unauthorizedHandler?.();
    if (!response.ok) {
      const message = isRecord(payload) ? String((payload as Partial<ErrorResponse>).error ?? '') : '';
      throw new ApiError(response.status, message || response.statusText);
    }
    return payload as T;
  }
}
