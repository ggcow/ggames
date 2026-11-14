import { env, runInDurableObject } from 'cloudflare:test';
import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  type ChatMessage,
  type ClientMessage,
  type Presence,
  parseServerMessage,
  type ReactionNotice,
} from '../../src/shared/platform/protocol.ts';
import type { World } from '../../src/worker/platform/world.ts';
import { call, newPlayer } from './support.ts';

const world = () => (env.WORLD as DurableObjectNamespace<World>).getByName('main');

/** Ouvre une connexion temps réel et collecte les listes de présence et les réactions reçues. */
async function connect(token: string) {
  const response = await exports.default.fetch(
    new Request(`https://test.local/api/live?token=${token}`, { headers: { Upgrade: 'websocket' } }),
  );
  const ws = response.webSocket;
  if (!ws) throw new Error(`pas de websocket (statut ${response.status})`);
  ws.accept();
  const presences: Presence[][] = [];
  const reactions: ReactionNotice[] = [];
  const chats: ChatMessage[] = [];
  const waiters: (() => void)[] = [];
  ws.addEventListener('message', (event) => {
    const msg = typeof event.data === 'string' ? parseServerMessage(event.data) : null;
    if (msg?.type === 'presence') presences.push(msg.online);
    if (msg?.type === 'reaction') reactions.push(msg.reaction);
    if (msg?.type === 'chat') chats.push(msg.message);
    for (const resolve of waiters.splice(0)) resolve();
  });
  const next = () => new Promise<void>((resolve) => waiters.push(resolve));
  /** Attend une liste de présence vérifiant `predicate`. */
  async function until(predicate: (online: Presence[]) => boolean): Promise<Presence[]> {
    for (;;) {
      const found = presences.find(predicate);
      if (found) return found;
      await next();
    }
  }
  /** Attend une réaction vérifiant `predicate`. */
  async function reactionUntil(predicate: (reaction: ReactionNotice) => boolean): Promise<ReactionNotice> {
    for (;;) {
      const found = reactions.find(predicate);
      if (found) return found;
      await next();
    }
  }
  /** Attend un message de salon vérifiant `predicate`. */
  async function chatUntil(predicate: (message: ChatMessage) => boolean): Promise<ChatMessage> {
    for (;;) {
      const found = chats.find(predicate);
      if (found) return found;
      await next();
    }
  }
  const send = (msg: ClientMessage) => ws.send(JSON.stringify(msg));
  return { ws, until, reactionUntil, chatUntil, reactions, chats, send };
}

describe('temps réel', () => {
  it('refuse une connexion sans session valide', async () => {
    const response = await exports.default.fetch(
      new Request('https://test.local/api/live?token=nope', { headers: { Upgrade: 'websocket' } }),
    );
    expect(response.status).toBe(401);
  });

  it('diffuse la présence et l’activité de chaque joueur', async () => {
    const a = await newPlayer();
    const b = await newPlayer();
    const liveA = await connect(a.token);
    const liveB = await connect(b.token);

    await liveA.until((online) => online.length === 2);
    liveB.send({ type: 'activity', game: 'fioles', key: 'c:3', state: 'abca.bcab.cabc..', value: 4 });
    const seen = await liveA.until((online) => online.some((p) => p.player === b.player.id && p.key === 'c:3'));
    expect(seen.find((p) => p.player === b.player.id)).toEqual({
      player: b.player.id,
      name: b.player.name,
      game: 'fioles',
      key: 'c:3',
      state: 'abca.bcab.cabc..',
      value: 4,
    });

    liveB.ws.close(1000, 'bye');
    await liveA.until((online) => online.length === 1 && online[0]?.player === a.player.id);
    liveA.ws.close(1000, 'bye');
  });

  it('diffuse une réaction aux joueurs du même niveau uniquement', async () => {
    const a = await newPlayer();
    const b = await newPlayer();
    const c = await newPlayer();
    const liveA = await connect(a.token);
    const liveB = await connect(b.token);
    const liveC = await connect(c.token);
    await liveA.until((online) => online.length === 3);

    liveA.send({ type: 'activity', game: 'fioles', key: 'c:1', state: '', value: 0 });
    liveB.send({ type: 'activity', game: 'fioles', key: 'c:1', state: '', value: 0 });
    liveC.send({ type: 'activity', game: 'fioles', key: 'c:2', state: '', value: 0 });
    await liveA.until((online) => online.some((p) => p.player === c.player.id && p.key === 'c:2'));

    liveB.send({ type: 'reaction', game: 'fioles', key: 'c:1', code: 'thumbs' });
    const seen = await liveA.reactionUntil((reaction) => reaction.player === b.player.id);
    expect(seen).toMatchObject({
      game: 'fioles',
      key: 'c:1',
      player: b.player.id,
      name: b.player.name,
      code: 'thumbs',
    });

    // C est sur un autre niveau : il ne reçoit pas la réaction de B.
    liveC.send({ type: 'reaction', game: 'fioles', key: 'c:2', code: 'fire' });
    await liveC.reactionUntil((reaction) => reaction.player === c.player.id);
    expect(liveC.reactions.some((reaction) => reaction.player === b.player.id)).toBe(false);

    // C tente d'envoyer sur un niveau où il n'est pas : le serveur ignore.
    liveC.send({ type: 'reaction', game: 'fioles', key: 'c:1', code: 'wow' });
    liveA.send({ type: 'reaction', game: 'fioles', key: 'c:1', code: 'party' });
    await liveA.reactionUntil((reaction) => reaction.player === a.player.id);
    expect(liveA.reactions.some((reaction) => reaction.player === c.player.id)).toBe(false);

    liveA.ws.close(1000, 'bye');
    liveB.ws.close(1000, 'bye');
    liveC.ws.close(1000, 'bye');
  });

  it('diffuse les messages du salon et les garde dans l’historique', async () => {
    const a = await newPlayer();
    const b = await newPlayer();
    const liveA = await connect(a.token);
    const liveB = await connect(b.token);
    await liveA.until((online) => online.length === 2);

    liveA.send({ type: 'chat', text: '  bonjour   à tous  ' });
    const seen = await liveB.chatUntil((message) => message.player === a.player.id);
    expect(seen).toMatchObject({ player: a.player.id, name: a.player.name, text: 'bonjour à tous' });

    const history = await call<ChatMessage[]>('/api/chat', { token: b.token });
    expect(history.body).toEqual([seen]);

    liveA.ws.close(1000, 'bye');
    liveB.ws.close(1000, 'bye');
  });

  it('limite le débit du salon et oublie les messages trop anciens', async () => {
    const a = await newPlayer();
    const live = await connect(a.token);
    for (let index = 0; index < 6; index++) live.send({ type: 'chat', text: `message ${index}` });
    await live.chatUntil((message) => message.text === 'message 4');
    await new Promise((resolve) => setTimeout(resolve, 50));

    const history = await call<ChatMessage[]>('/api/chat', { token: a.token });
    expect(history.body).toHaveLength(5);

    await runInDurableObject(world(), (_instance, state) => {
      state.storage.sql.exec('UPDATE chat_messages SET created = ?', Date.now() - 8 * 24 * 60 * 60 * 1000);
    });
    const old = await call<ChatMessage[]>('/api/chat', { token: a.token });
    expect(old.body).toEqual([]);

    live.ws.close(1000, 'bye');
  });

  it('exige une session pour lire le salon', async () => {
    expect((await call('/api/chat')).status).toBe(401);
  });

  it('ignore les messages invalides et les jeux inconnus', async () => {
    const a = await newPlayer();
    const live = await connect(a.token);
    live.ws.send('n’importe quoi');
    live.send({ type: 'activity', game: 'inconnu', key: 'k', state: '', value: 1 });
    live.send({ type: 'activity', game: 'fioles', key: 'c:1', state: '', value: 2 });
    const online = await live.until((list) => list[0]?.key === 'c:1');
    expect(online[0]).toMatchObject({ game: 'fioles', value: 2 });
    live.ws.close(1000, 'bye');
  });
});
