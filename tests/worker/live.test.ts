import { env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  type ChatMessage,
  type ClientMessage,
  LIMITS,
  type Presence,
  parseServerMessage,
  type RaceVoice,
  type RaceVoiceRead,
  type ReactionNotice,
  type VoiceNote,
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
  const voices: VoiceNote[] = [];
  const raceVoices: RaceVoice[] = [];
  const raceVoiceReads: RaceVoiceRead[] = [];
  const raceVoicesGone: string[] = [];
  const waiters: (() => void)[] = [];
  ws.addEventListener('message', (event) => {
    const msg = typeof event.data === 'string' ? parseServerMessage(event.data) : null;
    if (msg?.type === 'presence') presences.push(msg.online);
    if (msg?.type === 'reaction') reactions.push(msg.reaction);
    if (msg?.type === 'chat') chats.push(msg.message);
    if (msg?.type === 'voice') voices.push(msg.note);
    if (msg?.type === 'race_voice') raceVoices.push(msg.note);
    if (msg?.type === 'race_voice_read') raceVoiceReads.push(msg.read);
    if (msg?.type === 'race_voice_gone') raceVoicesGone.push(msg.id);
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
  /** Attend une note vocale de salon vérifiant `predicate`. */
  async function voiceUntil(predicate: (note: VoiceNote) => boolean): Promise<VoiceNote> {
    for (;;) {
      const found = voices.find(predicate);
      if (found) return found;
      await next();
    }
  }
  /** Attend une note vocale de course vérifiant `predicate`. */
  async function raceVoiceUntil(predicate: (note: RaceVoice) => boolean): Promise<RaceVoice> {
    for (;;) {
      const found = raceVoices.find(predicate);
      if (found) return found;
      await next();
    }
  }
  /** Attend un accusé de lecture de course vérifiant `predicate`. */
  async function raceVoiceReadUntil(predicate: (read: RaceVoiceRead) => boolean): Promise<RaceVoiceRead> {
    for (;;) {
      const found = raceVoiceReads.find(predicate);
      if (found) return found;
      await next();
    }
  }
  /** Attend la suppression d'une note de course. */
  async function raceVoiceGone(id: string): Promise<void> {
    while (!raceVoicesGone.includes(id)) await next();
  }
  const send = (msg: ClientMessage) => ws.send(JSON.stringify(msg));
  return {
    ws,
    until,
    reactionUntil,
    chatUntil,
    voiceUntil,
    raceVoiceUntil,
    raceVoiceReadUntil,
    raceVoiceGone,
    reactions,
    chats,
    voices,
    raceVoices,
    raceVoiceReads,
    send,
  };
}

async function uploadVoice(token: string, data: Uint8Array, durationMs = 1000, mime = 'audio/webm') {
  const response = await exports.default.fetch(
    new Request('https://test.local/api/voices', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': mime,
        'x-voice-duration': String(durationMs),
      },
      body: data,
    }),
  );
  return { status: response.status, body: (await response.json()) as VoiceNote };
}

async function uploadRaceVoice(
  token: string,
  game: string,
  key: string,
  data: Uint8Array,
  durationMs = 1000,
  mime = 'audio/webm',
) {
  const response = await exports.default.fetch(
    new Request(`https://test.local/api/games/${game}/voices?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': mime,
        'x-voice-duration': String(durationMs),
      },
      body: data,
    }),
  );
  return { status: response.status, body: (await response.json()) as RaceVoice };
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

  it('diffuse une note vocale du salon et la garde dans l’historique', async () => {
    const a = await newPlayer();
    const b = await newPlayer();
    const liveB = await connect(b.token);
    const data = new Uint8Array([1, 2, 3, 4]);

    const uploaded = await uploadVoice(a.token, data, 1000, 'audio/webm;codecs=opus');
    expect(uploaded.status).toBe(200);
    expect(uploaded.body).toMatchObject({ player: a.player.id, durationMs: 1000, mime: 'audio/webm' });
    const note = uploaded.body;
    expect((await liveB.voiceUntil((item) => item.id === note.id)).id).toBe(note.id);

    const history = await call<VoiceNote[]>('/api/voices', { token: b.token });
    expect(history.body).toEqual([note]);
    const audio = await exports.default.fetch(
      new Request(`https://test.local/api/voices/${note.id}`, { headers: { Authorization: `Bearer ${b.token}` } }),
    );
    expect(audio.status).toBe(200);
    expect(audio.headers.get('content-type')).toBe('audio/webm');
    expect(new Uint8Array(await audio.arrayBuffer())).toEqual(data);

    liveB.ws.close(1000, 'bye');
  });

  it('diffuse une note de course et la supprime quand les destinataires ont écouté', async () => {
    const a = await newPlayer();
    const b = await newPlayer();
    const c = await newPlayer();
    const liveA = await connect(a.token);
    const liveB = await connect(b.token);
    const liveC = await connect(c.token);
    await liveA.until((online) => online.length === 3);
    for (const live of [liveA, liveB, liveC]) {
      live.send({ type: 'activity', game: 'fioles', key: 'c:1', state: '', value: 0 });
    }
    await liveA.until((online) => online.filter((p) => p.key === 'c:1').length === 3);

    const data = new Uint8Array([1, 2, 3, 4]);
    const uploaded = await uploadRaceVoice(a.token, 'fioles', 'c:1', data);
    expect(uploaded.status).toBe(200);
    expect(uploaded.body).toMatchObject({ game: 'fioles', key: 'c:1', player: a.player.id, total: 2 });
    const note = uploaded.body;

    expect((await liveB.raceVoiceUntil((item) => item.id === note.id)).id).toBe(note.id);
    expect((await liveC.raceVoiceUntil((item) => item.id === note.id)).id).toBe(note.id);

    const audio = await exports.default.fetch(
      new Request(`https://test.local/api/race-voices/${note.id}`, {
        headers: { Authorization: `Bearer ${b.token}` },
      }),
    );
    expect(audio.status).toBe(200);
    expect(new Uint8Array(await audio.arrayBuffer())).toEqual(data);

    const firstRead = await call<{ readCount: number; total: number }>(`/api/race-voices/${note.id}/read`, {
      method: 'POST',
      token: b.token,
    });
    expect(firstRead.body).toEqual({ readCount: 1, total: 2 });
    await liveA.raceVoiceReadUntil((read) => read.id === note.id && read.readCount === 1);

    const forB = await call<RaceVoice[]>('/api/games/fioles/voices?key=c%3A1', { token: b.token });
    expect(forB.body[0]?.read).toBe(true);
    const forC = await call<RaceVoice[]>('/api/games/fioles/voices?key=c%3A1', { token: c.token });
    expect(forC.body[0]?.read).toBe(false);

    const secondRead = await call<{ readCount: number; total: number }>(`/api/race-voices/${note.id}/read`, {
      method: 'POST',
      token: c.token,
    });
    expect(secondRead.body).toEqual({ readCount: 2, total: 2 });
    await liveA.raceVoiceReadUntil((read) => read.id === note.id && read.readCount === 2);
    await liveA.raceVoiceGone(note.id);
    expect((await call<RaceVoice[]>('/api/games/fioles/voices?key=c%3A1', { token: a.token })).body).toEqual([]);

    liveA.ws.close(1000, 'bye');
    liveB.ws.close(1000, 'bye');
    liveC.ws.close(1000, 'bye');
  });

  it('supprime une note de course quand les destinataires restants quittent le niveau', async () => {
    const a = await newPlayer();
    const b = await newPlayer();
    const c = await newPlayer();
    const liveA = await connect(a.token);
    const liveB = await connect(b.token);
    const liveC = await connect(c.token);
    await liveA.until((online) => [b, c].every((p) => online.some((item) => item.player === p.player.id)));
    for (const live of [liveA, liveB, liveC]) {
      live.send({ type: 'activity', game: 'fioles', key: 'c:3', state: '', value: 0 });
    }
    await liveA.until((online) => online.filter((p) => p.key === 'c:3').length === 3);

    const note = (await uploadRaceVoice(a.token, 'fioles', 'c:3', new Uint8Array([1]))).body;
    await liveB.raceVoiceUntil((item) => item.id === note.id);
    await call(`/api/race-voices/${note.id}/read`, { method: 'POST', token: b.token });
    await liveA.raceVoiceReadUntil((read) => read.id === note.id && read.readCount === 1);

    liveC.send({ type: 'activity', game: 'fioles', key: 'c:4', state: '', value: 0 });
    await liveA.raceVoiceGone(note.id);
    expect((await call<RaceVoice[]>('/api/games/fioles/voices?key=c%3A3', { token: a.token })).body).toEqual([]);

    liveA.ws.close(1000, 'bye');
    liveB.ws.close(1000, 'bye');
    liveC.ws.close(1000, 'bye');
  });

  it('garde une note de course tant qu’un destinataire présent ne l’a pas écoutée', async () => {
    const a = await newPlayer();
    const b = await newPlayer();
    const c = await newPlayer();
    const liveA = await connect(a.token);
    const liveB = await connect(b.token);
    const liveC = await connect(c.token);
    await liveA.until((online) => [b, c].every((p) => online.some((item) => item.player === p.player.id)));
    for (const live of [liveA, liveB, liveC]) {
      live.send({ type: 'activity', game: 'fioles', key: 'c:5', state: '', value: 0 });
    }
    await liveA.until((online) => online.filter((p) => p.key === 'c:5').length === 3);

    const note = (await uploadRaceVoice(a.token, 'fioles', 'c:5', new Uint8Array([1]))).body;
    await liveC.raceVoiceUntil((item) => item.id === note.id);

    liveB.ws.close(1000, 'bye');
    await liveA.until((online) => !online.some((p) => p.player === b.player.id));
    const forC = await call<RaceVoice[]>('/api/games/fioles/voices?key=c%3A5', { token: c.token });
    expect(forC.body.map((item) => item.id)).toEqual([note.id]);

    liveC.ws.close(1000, 'bye');
    await liveA.raceVoiceGone(note.id);
    expect((await call<RaceVoice[]>('/api/games/fioles/voices?key=c%3A5', { token: a.token })).body).toEqual([]);

    liveA.ws.close(1000, 'bye');
  });

  it('fait expirer une note de course au bout de 30 secondes et prévient les joueurs du niveau', async () => {
    const a = await newPlayer();
    const b = await newPlayer();
    const liveA = await connect(a.token);
    const liveB = await connect(b.token);
    await liveA.until((online) => online.some((p) => p.player === b.player.id));
    for (const live of [liveA, liveB]) {
      live.send({ type: 'activity', game: 'fioles', key: 'c:6', state: '', value: 0 });
    }
    await liveA.until((online) => online.filter((p) => p.key === 'c:6').length === 2);

    const note = (await uploadRaceVoice(a.token, 'fioles', 'c:6', new Uint8Array([1]))).body;
    await liveB.raceVoiceUntil((item) => item.id === note.id);
    const alarm = await runInDurableObject(world(), (_instance, state) => state.storage.getAlarm());
    expect(alarm).not.toBeNull();
    expect(alarm ?? 0).toBeLessThanOrEqual(note.at + 30_000);

    await runInDurableObject(world(), (_instance, state) => {
      state.storage.sql.exec('UPDATE race_voices SET created = ? WHERE id = ?', Date.now() - 31_000, note.id);
    });
    expect(await runDurableObjectAlarm(world())).toBe(true);
    await liveA.raceVoiceGone(note.id);
    await liveB.raceVoiceGone(note.id);
    expect((await call<RaceVoice[]>('/api/games/fioles/voices?key=c%3A6', { token: b.token })).body).toEqual([]);
    const audio = await exports.default.fetch(
      new Request(`https://test.local/api/race-voices/${note.id}`, {
        headers: { Authorization: `Bearer ${b.token}` },
      }),
    );
    expect(audio.status).toBe(404);

    liveA.ws.close(1000, 'bye');
    liveB.ws.close(1000, 'bye');
  });

  it('refuse une note de course hors du niveau joué', async () => {
    const a = await newPlayer();
    const live = await connect(a.token);
    live.send({ type: 'activity', game: 'fioles', key: 'c:2', state: '', value: 0 });
    await live.until((online) => online.some((p) => p.player === a.player.id && p.key === 'c:2'));
    expect((await uploadRaceVoice(a.token, 'fioles', 'c:1', new Uint8Array([1]))).status).toBe(403);
    live.ws.close(1000, 'bye');
  });

  it('valide les notes vocales et oublie les anciennes', async () => {
    const a = await newPlayer();
    expect((await uploadVoice(a.token, new Uint8Array([1]), 1000, 'text/plain')).status).toBe(400);
    expect((await uploadVoice(a.token, new Uint8Array([1]), 0)).status).toBe(400);
    expect((await uploadVoice(a.token, new Uint8Array(), 1000)).status).toBe(400);
    expect((await uploadVoice(a.token, new Uint8Array([1]), LIMITS.voiceDurationMs + 1)).status).toBe(400);

    const uploaded = await uploadVoice(a.token, new Uint8Array([1, 2]));
    await runInDurableObject(world(), (_instance, state) => {
      state.storage.sql.exec('UPDATE voice_notes SET created = ?', Date.now() - 8 * 24 * 60 * 60 * 1000);
    });
    expect((await call<VoiceNote[]>('/api/voices', { token: a.token })).body).toEqual([]);
    expect((await call(`/api/voices/${uploaded.body.id}`, { token: a.token })).status).toBe(404);
  });

  it('exige une session pour les notes vocales', async () => {
    expect((await call('/api/voices')).status).toBe(401);
    expect((await call('/api/voices/abc123')).status).toBe(401);
    expect((await call('/api/games/fioles/voices?key=c%3A1')).status).toBe(401);
    expect((await call('/api/race-voices/abc123')).status).toBe(401);
    expect((await call('/api/race-voices/abc123/read', { method: 'POST' })).status).toBe(401);
    const response = await exports.default.fetch(
      new Request('https://test.local/api/voices', {
        method: 'POST',
        headers: { 'content-type': 'audio/webm', 'x-voice-duration': '1000' },
        body: new Uint8Array([1]),
      }),
    );
    expect(response.status).toBe(401);
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
