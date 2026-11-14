// Salon global côté client : historique court, messages reçus en direct et compteur de non-lus.

import type { ChatMessage, VoiceNote } from '../../shared/platform/protocol.ts';
import type { ApiClient } from './api.ts';
import type { LocalStore } from './storage.ts';

const HISTORY_LIMIT = 50;
const READ_KEY_PREFIX = 'chatRead:';

export class ChatStore {
  private readonly api: Pick<ApiClient, 'chat' | 'voices'>;
  private readonly store: LocalStore;
  private readonly readKey: string;
  private readonly listeners = new Set<() => void>();
  private items: ChatMessage[] = [];
  private voiceItems: VoiceNote[] = [];
  private lastRead: number;
  private unreadCount = 0;
  private loaded = false;
  private loading: Promise<void> | null = null;

  constructor(api: Pick<ApiClient, 'chat' | 'voices'>, store: LocalStore, player: string) {
    this.api = api;
    this.store = store;
    this.readKey = `${READ_KEY_PREFIX}${player}`;
    this.lastRead =
      store.get(this.readKey, (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null)) ?? 0;
  }

  get messages(): readonly ChatMessage[] {
    return this.items;
  }

  get voices(): readonly VoiceNote[] {
    return this.voiceItems;
  }

  get unread(): number {
    return this.unreadCount;
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Recharge l'historique et le fusionne avec les messages reçus en direct. */
  load(): Promise<void> {
    if (this.loading) return this.loading;
    const startedAt = Date.now();
    const request = Promise.all([this.api.chat(), this.api.voices()])
      .then(([messages, voices]) => {
        const byId = new Map<string, ChatMessage>();
        for (const message of [...this.items, ...messages]) byId.set(message.id, message);
        this.items = [...byId.values()].sort((a, b) => a.at - b.at).slice(-HISTORY_LIMIT);
        const known = new Set(voices.map((note) => note.id));
        const live = this.voiceItems.filter((note) => note.at > startedAt - 60_000 && !known.has(note.id));
        this.voiceItems = [...voices, ...live].sort((a, b) => a.at - b.at).slice(-HISTORY_LIMIT);
        this.unreadCount = this.items.filter((message) => message.at > this.lastRead).length;
        this.loaded = true;
        this.emit();
      })
      .finally(() => {
        this.loading = null;
      });
    this.loading = request;
    return request;
  }

  /** Message reçu en direct. */
  receive(message: ChatMessage): void {
    if (this.items.some((item) => item.id === message.id)) return;
    this.items = [...this.items, message].slice(-HISTORY_LIMIT);
    if (message.at > this.lastRead) this.unreadCount += 1;
    this.emit();
  }

  /** Note vocale reçue en direct. */
  receiveVoice(note: VoiceNote): void {
    if (this.voiceItems.some((item) => item.id === note.id)) return;
    this.voiceItems = [...this.voiceItems, note].sort((a, b) => a.at - b.at).slice(-HISTORY_LIMIT);
    this.emit();
  }

  /** Marque le salon comme lu jusqu'au dernier message affiché. */
  markRead(): void {
    const latest = this.items[this.items.length - 1]?.at ?? 0;
    if (this.unreadCount === 0 && this.lastRead >= latest) return;
    this.lastRead = Math.max(this.lastRead, latest);
    this.unreadCount = 0;
    this.store.set(this.readKey, this.lastRead);
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
