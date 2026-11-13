import { describe, expect, it } from 'vitest';
import {
  campaignBoard,
  campaignKey,
  campaignSpec,
  decodeActions,
  encodeActions,
  type FiolesAction,
  fioles,
  parseCampaignKey,
  playActions,
  startBoard,
} from '../../src/shared/games/fioles/definition.ts';
import { boardToString, isSolvable, isSolved, MAX_COLORS, parseBoard } from '../../src/shared/games/fioles/rules.ts';
import { solve } from '../support/fioles-solver.ts';

describe('campagne', () => {
  it('ajoute une couleur par niveau jusqu’au niveau 10, puis multiplie les plateaux candidats', () => {
    expect([1, 2, 5, 10, 11, 500].map((level) => campaignSpec(level).colors)).toEqual([3, 4, 7, 12, 12, MAX_COLORS]);
    expect([1, 2, 3, 40].map((level) => campaignSpec(level).noAdjacentPairs)).toEqual([false, false, true, true]);
    expect([1, 10, 11, 20, 50, 500].map((level) => campaignSpec(level).candidates)).toEqual([1, 1, 2, 11, 41, 41]);
    expect(campaignSpec(7).empty).toBe(2);
  });

  it('génère les niveaux 1 à 40 valides, faisables et identiques à chaque appel', () => {
    for (let level = 1; level <= 40; level++) {
      const board = campaignBoard(level);
      const spec = campaignSpec(level);
      expect(board).toHaveLength(spec.colors + spec.empty);
      if (spec.noAdjacentPairs) {
        expect(board.every((tube) => tube.every((color, i) => i === 0 || tube[i - 1] !== color))).toBe(true);
      }
      expect(parseBoard(boardToString(board))).not.toBeNull();
      expect(isSolved(board)).toBe(false);
      expect(isSolvable(board, 500_000)).toBe(true);
      expect(campaignBoard(level)).toEqual(board);
    }
  });

  it('renvoie une copie : modifier le plateau ne change pas le niveau', () => {
    const board = campaignBoard(2);
    board[0]?.pop();
    expect(campaignBoard(2)).not.toEqual(board);
  });
});

describe('clés', () => {
  it('reconnaît les niveaux de la campagne', () => {
    expect(campaignKey(12)).toBe('c:12');
    expect(parseCampaignKey('c:12')).toBe(12);
    expect(parseCampaignKey('c:9999')).toBe(9999);
    expect(fioles.isValidKey('c:3')).toBe(true);
  });

  it('exige d’avoir gagné le niveau précédent', () => {
    expect(fioles.prerequisite('c:1')).toBeNull();
    expect(fioles.prerequisite('c:2')).toBe('c:1');
    expect(fioles.prerequisite('c:40')).toBe('c:39');
    expect(fioles.prerequisite('x:1')).toBeNull();
  });

  it.each(['c:0', 'c:01', 'c:10000', 'l:abc123', 'x:1', ''])('rejette %s', (key) => {
    expect(parseCampaignKey(key)).toBeNull();
    expect(fioles.isValidKey(key)).toBe(false);
  });
});

describe('replays', () => {
  const actions: FiolesAction[] = [
    { type: 'pour', from: 0, to: 15 },
    { type: 'undo' },
    { type: 'pour', from: 10, to: 2 },
  ];

  it('encode et décode les actions', () => {
    expect(encodeActions(actions)).toBe('0fua2');
    expect(decodeActions('0fua2')).toEqual(actions);
    expect(decodeActions('')).toEqual([]);
  });

  it.each(['0', 'zz', '0g', 'U'])('rejette un replay mal formé : %s', (replay) => {
    expect(decodeActions(replay)).toBeNull();
  });

  it('rejoue les états et gère l’annulation', () => {
    const start = [[0, 1], [1], []];
    const states = playActions(start, [
      { type: 'pour', from: 0, to: 1 },
      { type: 'undo' },
      { type: 'pour', from: 0, to: 2 },
    ]);
    expect(states).toEqual([start, [[0], [1, 1], []], start, [[0], [1], [1]]]);
  });

  it('refuse une action impossible ou une annulation sans historique', () => {
    expect(playActions([[0], [1], []], [{ type: 'pour', from: 0, to: 1 }])).toBeNull();
    expect(playActions([[0], []], [{ type: 'undo' }])).toBeNull();
  });

  it('valide une victoire et compte chaque action comme un coup', () => {
    const board = campaignBoard(1);
    const win = solve(board);
    if (!win) throw new Error('pas de solution');
    const withUndo: FiolesAction[] = [win[0] as FiolesAction, { type: 'undo' }, ...win];
    expect(fioles.replay('c:1', encodeActions(win))).toEqual({ finished: true, value: win.length });
    expect(fioles.replay('c:1', encodeActions(withUndo))).toEqual({ finished: true, value: win.length + 2 });
    expect(fioles.replay('c:1', encodeActions(win.slice(0, 1)))).toEqual({ finished: false, value: 1 });
  });

  it('refuse des actions après la victoire', () => {
    const win = solve(campaignBoard(1));
    if (!win) throw new Error('pas de solution');
    const extra = encodeActions([...win, { type: 'undo' }]);
    expect(fioles.replay('c:1', extra)).toBeNull();
  });

  it('refuse une clé invalide', () => {
    expect(startBoard('x:1')).toBeNull();
    expect(fioles.replay('x:1', '')).toBeNull();
  });
});
