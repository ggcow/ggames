// Connexion temps réel : présence des joueurs et notifications de changement.
// Se reconnecte automatiquement avec un délai croissant ; envoie un ping régulier.

import {
  type ClientMessage,
  PING,
  type Presence,
  parseServerMessage,
  ROUTES,
  type ServerMessage,
} from '../../shared/platform/protocol.ts';

export type LiveListener = (message: ServerMessage) => void;

export type SocketFactory = (url: string) => WebSocket;

const PING_INTERVAL_MS = 25_000;
const MAX_RETRY_MS = 30_000;

export class LiveClient {
  private readonly createSocket: SocketFactory;
  private readonly baseUrl: string;
  private readonly listeners = new Set<LiveListener>();
  private socket: WebSocket | null = null;
  private token: string | null = null;
  private retryMs = 1000;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastActivity: ClientMessage = { type: 'idle' };
  private online: Presence[] = [];

  constructor(createSocket: SocketFactory, baseUrl: string) {
    this.createSocket = createSocket;
    this.baseUrl = baseUrl;
  }

  get presence(): readonly Presence[] {
    return this.online;
  }

  subscribe(listener: LiveListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  connect(token: string): void {
    this.disconnect();
    this.token = token;
    this.open();
  }

  disconnect(): void {
    this.token = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.retryTimer = null;
    this.pingTimer = null;
    this.socket?.close(1000, 'logout');
    this.socket = null;
    this.online = [];
  }

  /** Déclare ce que fait le joueur ; renvoyé automatiquement après une reconnexion. */
  setActivity(activity: ClientMessage): void {
    this.lastActivity = activity;
    this.send(activity);
  }

  private open(): void {
    if (!this.token) return;
    const socket = this.createSocket(`${this.baseUrl}${ROUTES.live}?token=${encodeURIComponent(this.token)}`);
    this.socket = socket;
    socket.addEventListener('open', () => {
      this.retryMs = 1000;
      this.send(this.lastActivity);
      this.pingTimer = setInterval(() => this.socket?.send(PING), PING_INTERVAL_MS);
    });
    socket.addEventListener('message', (event: MessageEvent<unknown>) => {
      const message = typeof event.data === 'string' ? parseServerMessage(event.data) : null;
      if (!message) return;
      if (message.type === 'presence') this.online = message.online;
      for (const listener of this.listeners) listener(message);
    });
    socket.addEventListener('close', () => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      if (this.socket !== socket || !this.token) return;
      this.socket = null;
      this.retryTimer = setTimeout(() => this.open(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
    });
  }

  private send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }
}
