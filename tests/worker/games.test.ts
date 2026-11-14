import { describe, expect, it } from 'vitest';
import { campaignKey } from '../../src/shared/games/campaign.ts';
import { encodeActions, type FiolesAction } from '../../src/shared/games/fioles/definition.ts';
import type { Board } from '../../src/shared/games/fioles/rules.ts';
import type {
  GameState,
  GameSummary,
  PlayerGameDetail,
  Run,
  SubmitRunResponse,
} from '../../src/shared/platform/protocol.ts';
import { fiolesLevel, solve } from '../support/fioles-solver.ts';
import { call, newPlayer } from './support.ts';

const solution = (board: Board): FiolesAction[] => {
  const actions = solve(board);
  if (!actions) throw new Error('plateau sans solution');
  return actions;
};

const LEVEL_1 = fiolesLevel(1);
const WIN_1 = encodeActions(solution(LEVEL_1));
const LEVEL_2 = fiolesLevel(2);
const WIN_2 = encodeActions(solution(LEVEL_2));

const submit = (token: string, body: unknown) => call<SubmitRunResponse>('/api/games/fioles/runs', { token, body });

describe('jeux', () => {
  it('liste les jeux disponibles avec leurs statistiques', async () => {
    const { token } = await newPlayer();
    const { body } = await call<GameSummary[]>('/api/games', { token });
    expect(body).toEqual([{ id: 'fioles', players: 0, runs: 0, lastPlayed: null }]);
  });

  it('répond 404 pour un jeu inconnu', async () => {
    const { token } = await newPlayer();
    expect((await call('/api/games/inconnu', { token })).status).toBe(404);
  });
});

describe('parties', () => {
  it('enregistre une partie gagnée avec le score recalculé par le serveur', async () => {
    const me = await newPlayer();
    const { status, body } = await submit(me.token, {
      key: campaignKey(1),
      status: 'won',
      durationMs: 12_000,
      replay: WIN_1,
    });
    expect(status).toBe(200);
    expect(body.run).toMatchObject({ key: 'c:1', status: 'won', value: WIN_1.length / 2, player: me.player.id });
    expect(body.records).toEqual([{ player: me.player.id, value: body.run.value, run: body.run.id }]);
  });

  it('refuse une victoire dont le replay ne résout pas le niveau', async () => {
    const { token } = await newPlayer();
    const partial = WIN_1.slice(0, 2);
    expect((await submit(token, { key: 'c:1', status: 'won', durationMs: 1, replay: partial })).status).toBe(400);
  });

  it('refuse un replay contenant une action impossible', async () => {
    const { token } = await newPlayer();
    expect((await submit(token, { key: 'c:1', status: 'abandoned', durationMs: 1, replay: 'u' })).status).toBe(400);
    expect((await submit(token, { key: 'c:1', status: 'abandoned', durationMs: 1, replay: 'zz' })).status).toBe(400);
  });

  it('refuse une clé inconnue', async () => {
    const { token } = await newPlayer();
    expect((await submit(token, { key: 'x:1', status: 'abandoned', durationMs: 1, replay: '' })).status).toBe(400);
    expect((await submit(token, { key: 'c:0', status: 'abandoned', durationMs: 1, replay: '' })).status).toBe(400);
  });

  it('refuse un niveau que personne n’a débloqué, puis l’accepte une fois le précédent gagné', async () => {
    const { token } = await newPlayer();
    const win2 = encodeActions(solution(fiolesLevel(2)));
    expect((await submit(token, { key: 'c:2', status: 'won', durationMs: 1, replay: win2 })).status).toBe(403);
    await submit(token, { key: 'c:1', status: 'abandoned', durationMs: 1, replay: WIN_1.slice(0, 2) });
    expect((await submit(token, { key: 'c:2', status: 'won', durationMs: 1, replay: win2 })).status).toBe(403);
    await submit(token, { key: 'c:1', status: 'won', durationMs: 1, replay: WIN_1 });
    expect((await submit(token, { key: 'c:2', status: 'won', durationMs: 1, replay: win2 })).status).toBe(200);
  });

  it('accepte un niveau débloqué par un autre joueur : on peut le rejoindre', async () => {
    const leader = await newPlayer();
    const joiner = await newPlayer();
    const win2 = encodeActions(solution(fiolesLevel(2)));
    await submit(leader.token, { key: 'c:1', status: 'won', durationMs: 1, replay: WIN_1 });
    expect((await submit(joiner.token, { key: 'c:2', status: 'won', durationMs: 1, replay: win2 })).status).toBe(200);
    const win3 = encodeActions(solution(fiolesLevel(3)));
    expect((await submit(joiner.token, { key: 'c:3', status: 'won', durationMs: 1, replay: win3 })).status).toBe(403);
  });

  it('calcule progression, détail par niveau et replay de ses propres parties', async () => {
    const me = await newPlayer();
    const other = await newPlayer();
    const abandoned = await submit(me.token, {
      key: 'c:1',
      status: 'abandoned',
      durationMs: 3000,
      replay: WIN_1.slice(0, 2),
    });
    const won = await submit(me.token, { key: 'c:1', status: 'won', durationMs: 9000, replay: WIN_1 });

    const state = await call<GameState>('/api/games/fioles', { token: other.token });
    expect(state.body.progress).toEqual([
      { player: me.player.id, completed: 1, runs: 2, playTimeMs: 12_000, lastPlayed: won.body.run.ended },
    ]);
    expect(state.body.records['c:1']?.[0]?.player).toBe(me.player.id);
    expect(state.body.players.map((p) => p.id)).toEqual(expect.arrayContaining([me.player.id, other.player.id]));

    const detail = await call<PlayerGameDetail>(`/api/games/fioles/players/${me.player.id}`, { token: me.token });
    expect(detail.body.keys).toEqual([{ key: 'c:1', attempts: 2, wins: 1, best: won.body.run }]);

    expect((await call(`/api/runs/${abandoned.body.run.id}`, { token: me.token })).status).toBe(404);
    const run = await call<Run>(`/api/runs/${won.body.run.id}`, { token: me.token });
    expect(run.body).toEqual({ ...won.body.run, replay: WIN_1 });

    const games = await call<GameSummary[]>('/api/games', { token: other.token });
    expect(games.body[0]).toMatchObject({ id: 'fioles', players: 1, runs: 2 });
  });

  it('ne montre les replays d’un ami que pour les niveaux réussis par les deux', async () => {
    const me = await newPlayer();
    const friend = await newPlayer();
    const friendWin = await submit(friend.token, { key: 'c:1', status: 'won', durationMs: 1, replay: WIN_1 });

    // L'ami a réussi le niveau 1, pas moi : ni la ligne ni le replay ne sont visibles.
    const hidden = await call<PlayerGameDetail>(`/api/games/fioles/players/${friend.player.id}`, {
      token: me.token,
    });
    expect(hidden.body.keys).toEqual([]);
    expect((await call(`/api/runs/${friendWin.body.run.id}`, { token: me.token })).status).toBe(404);

    // Je réussis le niveau 1 : son replay devient consultable.
    await submit(me.token, { key: 'c:1', status: 'won', durationMs: 2, replay: WIN_1 });
    const shared = await call<PlayerGameDetail>(`/api/games/fioles/players/${friend.player.id}`, {
      token: me.token,
    });
    expect(shared.body.keys).toEqual([{ key: 'c:1', attempts: 1, wins: 1, best: friendWin.body.run }]);
    const run = await call<Run>(`/api/runs/${friendWin.body.run.id}`, { token: me.token });
    expect(run.body).toEqual({ ...friendWin.body.run, replay: WIN_1 });

    // Un niveau que l'ami a joué sans le gagner reste hors de sa liste, même si moi je l'ai réussi.
    await submit(friend.token, { key: 'c:2', status: 'lost', durationMs: 1, replay: WIN_2.slice(0, 2) });
    await submit(me.token, { key: 'c:2', status: 'won', durationMs: 1, replay: WIN_2 });
    const after = await call<PlayerGameDetail>(`/api/games/fioles/players/${friend.player.id}`, {
      token: me.token,
    });
    expect(after.body.keys.map((key) => key.key)).toEqual(['c:1']);
  });

  it('ne sert le replay que des parties gagnées', async () => {
    const me = await newPlayer();
    const lost = await submit(me.token, { key: 'c:1', status: 'lost', durationMs: 1000, replay: WIN_1.slice(0, 2) });
    expect(lost.status).toBe(200);
    expect((await call(`/api/runs/${lost.body.run.id}`, { token: me.token })).status).toBe(404);

    const abandoned = await submit(me.token, { key: 'c:1', status: 'abandoned', durationMs: 1, replay: '' });
    expect(abandoned.status).toBe(200);
    expect((await call(`/api/runs/${abandoned.body.run.id}`, { token: me.token })).status).toBe(404);

    expect((await call('/api/runs/inconnu', { token: me.token })).status).toBe(404);

    const won = await submit(me.token, { key: 'c:1', status: 'won', durationMs: 1, replay: WIN_1 });
    const replay = await call<Run>(`/api/runs/${won.body.run.id}`, { token: me.token });
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual({ ...won.body.run, replay: WIN_1 });
  });

  it('ne propose pas de replay pour un niveau sans victoire', async () => {
    const me = await newPlayer();
    const lost = await submit(me.token, { key: 'c:1', status: 'lost', durationMs: 1, replay: WIN_1.slice(0, 2) });
    expect(lost.status).toBe(200);

    const detail = await call<PlayerGameDetail>(`/api/games/fioles/players/${me.player.id}`, { token: me.token });
    expect(detail.body.keys).toEqual([{ key: 'c:1', attempts: 1, wins: 0, best: null }]);
  });

  it('classe les joueurs par meilleur score et ne garde que le meilleur de chacun', async () => {
    const a = await newPlayer();
    const b = await newPlayer();
    const slower = encodeActions([{ type: 'pour', from: 0, to: 3 }, { type: 'undo' }, ...solution(LEVEL_1)]);
    await submit(a.token, { key: 'c:1', status: 'won', durationMs: 1, replay: slower });
    await submit(b.token, { key: 'c:1', status: 'won', durationMs: 1, replay: WIN_1 });
    const best = await submit(a.token, { key: 'c:1', status: 'won', durationMs: 1, replay: WIN_1 });
    expect(best.body.records.map((r) => r.player)).toEqual([b.player.id, a.player.id]);
    expect(best.body.records.every((r) => r.value === WIN_1.length / 2)).toBe(true);
  });
});
