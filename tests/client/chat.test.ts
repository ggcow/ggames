import { describe, expect, it, vi } from 'vitest';
import { ChatStore } from '../../src/client/platform/chat.ts';
import type { LocalStore } from '../../src/client/platform/storage.ts';
import type { ChatMessage } from '../../src/shared/platform/protocol.ts';

const message = (id: string, at: number, text = 'salut'): ChatMessage => ({
  id,
  player: 'p1',
  name: 'Léa',
  text,
  at,
});

function memoryStore(): LocalStore {
  const values = new Map<string, unknown>();
  return {
    get(key, parse) {
      const value = values.get(key);
      return value === undefined ? null : parse(value);
    },
    set(key, value) {
      values.set(key, value);
    },
    remove(key) {
      values.delete(key);
    },
  };
}

const api = (messages: ChatMessage[]) => ({ chat: vi.fn(async () => messages) });

describe('salon côté client', () => {
  it('charge l’historique et compte les messages non lus', async () => {
    const store = memoryStore();
    const client = api([message('m1', 100), message('m2', 200)]);
    const chat = new ChatStore(client, store, 'p1');

    await chat.load();

    expect(chat.isLoaded).toBe(true);
    expect(chat.messages.map((item) => item.id)).toEqual(['m1', 'm2']);
    expect(chat.unread).toBe(2);
    expect(client.chat).toHaveBeenCalledOnce();
  });

  it('ajoute les messages en direct sans doublon', async () => {
    const chat = new ChatStore(api([]), memoryStore(), 'p1');
    await chat.load();

    chat.receive(message('m1', 100));
    chat.receive(message('m1', 100));
    chat.receive(message('m2', 200));

    expect(chat.messages.map((item) => item.id)).toEqual(['m1', 'm2']);
    expect(chat.unread).toBe(2);
  });

  it('marque le salon comme lu et mémorise la position par joueur', async () => {
    const store = memoryStore();
    const chat = new ChatStore(api([message('m1', 100), message('m2', 200)]), store, 'p1');
    await chat.load();
    chat.markRead();

    expect(chat.unread).toBe(0);

    const next = new ChatStore(api([message('m1', 100), message('m2', 200)]), store, 'p1');
    await next.load();
    expect(next.unread).toBe(0);
  });

  it('garde les 50 derniers messages et fusionne l’historique avec le direct', async () => {
    const history = Array.from({ length: 55 }, (_, index) => message(`m${index}`, index + 1));
    const chat = new ChatStore(api(history), memoryStore(), 'p1');
    await chat.load();
    expect(chat.messages).toHaveLength(50);
    expect(chat.messages[0]?.id).toBe('m5');

    chat.receive(message('live', 1000));
    expect(chat.messages).toHaveLength(50);
    expect(chat.messages[49]?.id).toBe('live');
  });

  it('prévient les abonnés et s’arrête après désabonnement', async () => {
    const chat = new ChatStore(api([]), memoryStore(), 'p1');
    const listener = vi.fn();
    const unsubscribe = chat.subscribe(listener);

    await chat.load();
    chat.receive(message('m1', 100));
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    chat.receive(message('m2', 200));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
