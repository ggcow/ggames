import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  type ClientMessage,
  type Presence,
  parseServerMessage,
  type ReactionNotice,
} from '../../src/shared/platform/protocol.ts';
import { newPlayer } from './support.ts';

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
  const waiters: (() => void)[] = [];
  ws.addEventListener('message', (event) => {
    const msg = typeof event.data === 'string' ? parseServerMessage(event.data) : null;
    if (msg?.type === 'presence') presences.push(msg.online);
    if (msg?.type === 'reaction') reactions.push(msg.reaction);
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
  const send = (msg: ClientMessage) => ws.send(JSON.stringify(msg));
  return { ws, until, reactionUntil, reactions, send };
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
