// Client HTTP typé de l'API. Une méthode par route ; les erreurs deviennent des ApiError.

import {
  type ChatMessage,
  type CredentialsRequest,
  type ErrorResponse,
  type GameId,
  type GameState,
  type GameSummary,
  type PlayerGameDetail,
  type PlayerId,
  type PlayerInfo,
  type RaceVoice,
  ROUTES,
  type Run,
  type RunId,
  type SessionResponse,
  type SubmitRunRequest,
  type SubmitRunResponse,
  type VoiceNote,
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
  chat = () => this.request<ChatMessage[]>('GET', ROUTES.chat);
  voices = () => this.request<VoiceNote[]>('GET', ROUTES.voices);
  voice = async (id: string): Promise<Blob> => {
    const response = await this.send('GET', ROUTES.voice(id));
    if (!response.ok) await this.fail(response);
    return response.blob();
  };
  uploadVoice = async (blob: Blob, durationMs: number): Promise<VoiceNote> => {
    const response = await this.send('POST', ROUTES.voices, blob, {
      'content-type': blob.type || 'application/octet-stream',
      'x-voice-duration': String(durationMs),
    });
    return this.parseJson<VoiceNote>(response);
  };
  raceVoices = (game: GameId, key: string) => this.request<RaceVoice[]>('GET', ROUTES.raceVoices(game, key));
  raceVoice = async (id: string): Promise<Blob> => {
    const response = await this.send('GET', ROUTES.raceVoice(id));
    if (!response.ok) await this.fail(response);
    return response.blob();
  };
  uploadRaceVoice = async (game: GameId, key: string, blob: Blob, durationMs: number): Promise<RaceVoice> => {
    const response = await this.send('POST', ROUTES.raceVoices(game, key), blob, {
      'content-type': blob.type || 'application/octet-stream',
      'x-voice-duration': String(durationMs),
    });
    return this.parseJson<RaceVoice>(response);
  };
  markRaceVoiceRead = (id: string) =>
    this.request<{ readCount: number; total: number }>('POST', ROUTES.raceVoiceRead(id));
  game = (game: GameId) => this.request<GameState>('GET', ROUTES.game(game));
  playerDetail = (game: GameId, player: PlayerId) =>
    this.request<PlayerGameDetail>('GET', ROUTES.playerDetail(game, player));
  submitRun = (game: GameId, body: SubmitRunRequest) =>
    this.request<SubmitRunResponse>('POST', ROUTES.runs(game), body);
  run = (id: RunId) => this.request<Run>('GET', ROUTES.run(id));

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers = body !== undefined ? { 'content-type': 'application/json' } : {};
    const response = await this.send(method, path, body !== undefined ? JSON.stringify(body) : undefined, headers);
    return this.parseJson<T>(response);
  }

  private async send(
    method: string,
    path: string,
    body?: BodyInit,
    headers: Record<string, string> = {},
  ): Promise<Response> {
    const requestHeaders = { ...headers };
    if (this.token) requestHeaders['Authorization'] = `Bearer ${this.token}`;
    const init: RequestInit = { method, headers: requestHeaders };
    if (body !== undefined) init.body = body;
    let response: Response;
    try {
      response = await this.fetchImpl(path, init);
    } catch {
      throw new ApiError(NETWORK_ERROR, 'network');
    }
    if (response.status === 401 && this.token) this.unauthorizedHandler?.();
    return response;
  }

  private async parseJson<T>(response: Response): Promise<T> {
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = isRecord(payload) ? String((payload as Partial<ErrorResponse>).error ?? '') : '';
      throw new ApiError(response.status, message || response.statusText);
    }
    return payload as T;
  }

  private async fail(response: Response): Promise<never> {
    const payload: unknown = await response.json().catch(() => null);
    const message = isRecord(payload) ? String((payload as Partial<ErrorResponse>).error ?? '') : '';
    throw new ApiError(response.status, message || response.statusText);
  }
}
