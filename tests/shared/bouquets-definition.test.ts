import { describe, expect, it } from 'vitest';
import {
  type BouquetsAction,
  bouquets,
  decodeActions,
  encodeActions,
  levelBoard,
  playActions,
  startBoard,
} from '../../src/shared/games/bouquets/definition.ts';
import { campaignSpec } from '../../src/shared/games/bouquets/generate.ts';
import { LEVELS } from '../../src/shared/games/bouquets/levels.ts';
import { type Board, frontOf, isSolved, liveState, parseLiveState } from '../../src/shared/games/bouquets/rules.ts';
import { MAX_LEVEL } from '../../src/shared/games/campaign.ts';
import { bouquetsLevel, bouquetsWin } from '../support/bouquets.ts';

const _ = null;

describe('campagne', () => {
  it('enregistre un plateau valide, aux paramètres de son niveau, pour chaque niveau', () => {
    expect(LEVELS).toHaveLength(MAX_LEVEL);
    for (let level = 1; level <= MAX_LEVEL; level++) {
      const board = bouquetsLevel(level);
      const spec = campaignSpec(level);
      expect(board).toHaveLength(spec.pots);
      expect(board.every((pot) => pot.length <= spec.depth + 1)).toBe(true);
      const free = board.reduce((n, pot) => n + frontOf(pot).filter((slot) => slot === null).length, 0);
      expect(free).toBeGreaterThanOrEqual(spec.free);
      expect(isSolved(board)).toBe(false);
      expect(parseLiveState(liveState(board))).not.toBeNull();
    }
  });

  // Les derniers niveaux demandent au solveur plusieurs secondes chacun.
  it('a une solution pour chaque niveau', { timeout: 120_000 }, () => {
    for (let level = 1; level <= MAX_LEVEL; level++) expect(bouquetsWin(level).length).toBeGreaterThan(0);
  });

  it('n’a aucun niveau en double', () => {
    expect(new Set(LEVELS).size).toBe(MAX_LEVEL);
  });

  it('n’a pas de niveau hors de la campagne', () => {
    expect(levelBoard(0)).toBeNull();
    expect(levelBoard(MAX_LEVEL + 1)).toBeNull();
  });

  it('renvoie une copie : modifier le plateau ne change pas le niveau', () => {
    const board = bouquetsLevel(2);
    board[0]?.[0]?.fill(_);
    expect(bouquetsLevel(2)).not.toEqual(board);
  });
});

describe('clés', () => {
  it('reconnaît les niveaux de la campagne', () => {
    expect(bouquets.isValidKey('c:3')).toBe(true);
    expect(bouquets.isValidKey('c:100')).toBe(true);
  });

  it('range les clés dans l’ordre de la campagne', () => {
    expect(['c:10', 'c:2', 'c:1'].sort(bouquets.compareKeys)).toEqual(['c:1', 'c:2', 'c:10']);
  });

  it('utilise la progression de la campagne', () => {
    expect(bouquets.isUnlocked('c:1', new Set())).toBe(true);
    expect(bouquets.isUnlocked('c:3', new Set(['c:1', 'c:2']))).toBe(true);
    expect(bouquets.isUnlocked('c:3', new Set(['c:2']))).toBe(false);
  });

  it.each(['c:0', 'c:01', 'c:101', 'x:1', ''])('rejette %s', (key) => {
    expect(bouquets.isValidKey(key)).toBe(false);
  });
});

describe('replays', () => {
  const actions: BouquetsAction[] = [
    { type: 'move', from: 0, slot: 2, to: 11, place: 1 },
    { type: 'undo' },
    { type: 'move', from: 10, slot: 0, to: 3, place: 2 },
  ];

  it('encode et décode les actions', () => {
    expect(encodeActions(actions)).toBe('02b1ua032');
    expect(decodeActions('02b1ua032')).toEqual(actions);
    expect(decodeActions('')).toEqual([]);
  });

  it.each(['0', '012', 'zzzz', '012g', 'U'])('rejette un replay mal formé : %s', (replay) => {
    expect(decodeActions(replay)).toBeNull();
  });

  it('rejoue les états et gère l’annulation', () => {
    const start: Board = [[[0, 1, _]], [[_, _, _]]];
    const states = playActions(start, [
      { type: 'move', from: 0, slot: 0, to: 1, place: 2 },
      { type: 'undo' },
      { type: 'move', from: 0, slot: 1, to: 1, place: 0 },
    ]);
    expect(states).toEqual([start, [[[_, 1, _]], [[_, _, 0]]], start, [[[0, _, _]], [[1, _, _]]]]);
  });

  it('refuse une action impossible ou une annulation sans historique', () => {
    expect(playActions([[[0, _, _]], [[1, 2, 3]]], [{ type: 'move', from: 0, slot: 0, to: 1, place: 0 }])).toBeNull();
    expect(playActions([[[0, _, _]]], [{ type: 'undo' }])).toBeNull();
  });

  it('valide une victoire, compte chaque coup et retire un coup par annulation', () => {
    const solution = bouquetsWin(1);
    const first = solution[0];
    if (!first) throw new Error('premier coup attendu');
    const withUndo: BouquetsAction[] = [first, { type: 'undo' }, ...solution];
    expect(bouquets.replay('c:1', encodeActions(solution))).toEqual({ finished: true, value: solution.length });
    expect(bouquets.replay('c:1', encodeActions(withUndo))).toEqual({ finished: true, value: solution.length });
    expect(bouquets.replay('c:1', encodeActions(solution.slice(0, 1)))).toEqual({ finished: false, value: 1 });
  });

  it('refuse des actions après la victoire', () => {
    const extra = encodeActions([...bouquetsWin(1), { type: 'undo' }]);
    expect(bouquets.replay('c:1', extra)).toBeNull();
  });

  it('refuse une clé invalide ou un replay illisible', () => {
    expect(startBoard('x:1')).toBeNull();
    expect(bouquets.replay('x:1', '')).toBeNull();
    expect(bouquets.replay('c:1', 'zz')).toBeNull();
  });
});

describe('meilleur score possible', () => {
  it('reste inconnu : aucune recherche exhaustive ne le prouve', () => {
    expect(bouquets.bestPossible('c:1')).toBeNull();
  });
});
