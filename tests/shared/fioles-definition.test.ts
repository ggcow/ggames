import { describe, expect, it } from 'vitest';
import { MAX_LEVEL } from '../../src/shared/games/campaign.ts';
import {
  decodeActions,
  encodeActions,
  type FiolesAction,
  fioles,
  levelBoard,
  playActions,
  startBoard,
} from '../../src/shared/games/fioles/definition.ts';
import { isSolvable, minimalMoves } from '../../src/shared/games/fioles/generate.ts';
import { LEVELS } from '../../src/shared/games/fioles/levels.ts';
import { OPTIMAL } from '../../src/shared/games/fioles/optimal.ts';
import { isSolved } from '../../src/shared/games/fioles/rules.ts';
import { fiolesLevel, solve } from '../support/fioles-solver.ts';

describe('campagne', () => {
  it('enregistre un plateau valide, faisable et non résolu pour chaque niveau', { timeout: 120_000 }, () => {
    expect(LEVELS).toHaveLength(MAX_LEVEL);
    for (let n = 1; n <= MAX_LEVEL; n++) {
      const board = fiolesLevel(n);
      expect(isSolved(board)).toBe(false);
      expect(isSolvable(board, 500_000)).toBe(true);
    }
  });

  it('n’a aucun niveau en double', () => {
    expect(new Set(LEVELS).size).toBe(MAX_LEVEL);
  });

  it('n’a pas de niveau hors de la campagne', () => {
    expect(levelBoard(0)).toBeNull();
    expect(levelBoard(MAX_LEVEL + 1)).toBeNull();
  });

  it('renvoie une copie : modifier le plateau ne change pas le niveau', () => {
    const board = fiolesLevel(2);
    board[0]?.pop();
    expect(fiolesLevel(2)).not.toEqual(board);
  });
});

describe('clés', () => {
  it('reconnaît les niveaux de la campagne', () => {
    expect(fioles.isValidKey('c:3')).toBe(true);
    expect(fioles.isValidKey('c:100')).toBe(true);
  });

  it('range les clés dans l’ordre de la campagne', () => {
    expect(['c:10', 'c:2', 'c:1'].sort(fioles.compareKeys)).toEqual(['c:1', 'c:2', 'c:10']);
  });

  it('utilise la progression de la campagne', () => {
    expect(fioles.isUnlocked('c:1', new Set())).toBe(true);
    expect(fioles.isUnlocked('c:3', new Set(['c:1', 'c:2']))).toBe(true);
    expect(fioles.isUnlocked('c:3', new Set(['c:2']))).toBe(false);
  });

  it.each(['c:0', 'c:01', 'c:101', 'c:1000', 'l:abc123', 'x:1', ''])('rejette %s', (key) => {
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

  it('valide une victoire, compte chaque coup et retire un coup par annulation', () => {
    const board = fiolesLevel(1);
    const win = solve(board);
    if (!win) throw new Error('pas de solution');
    const withUndo: FiolesAction[] = [win[0] as FiolesAction, { type: 'undo' }, ...win];
    expect(fioles.replay('c:1', encodeActions(win))).toEqual({ finished: true, value: win.length });
    expect(fioles.replay('c:1', encodeActions(withUndo))).toEqual({ finished: true, value: win.length });
    expect(fioles.replay('c:1', encodeActions(win.slice(0, 1)))).toEqual({ finished: false, value: 1 });
  });

  it('refuse des actions après la victoire', () => {
    const win = solve(fiolesLevel(1));
    if (!win) throw new Error('pas de solution');
    const extra = encodeActions([...win, { type: 'undo' }]);
    expect(fioles.replay('c:1', extra)).toBeNull();
  });

  it('refuse une clé invalide', () => {
    expect(startBoard('x:1')).toBeNull();
    expect(fioles.replay('x:1', '')).toBeNull();
  });
});

describe('meilleur score possible', () => {
  it('donne une valeur par niveau de la campagne, et rien pour une clé inconnue', () => {
    expect(OPTIMAL).toHaveLength(MAX_LEVEL);
    expect(fioles.bestPossible('c:1')).toBe(OPTIMAL[0]);
    expect(fioles.bestPossible(`c:${MAX_LEVEL}`)).toBe(OPTIMAL[MAX_LEVEL - 1]);
    expect(fioles.bestPossible('c:0')).toBeNull();
    expect(fioles.bestPossible('n’importe quoi')).toBeNull();
  });

  it.each([1, 2, 3])('est atteint par une vraie partie au niveau %i', (level) => {
    const win = solve(fiolesLevel(level));
    if (!win) throw new Error('solution attendue');
    expect(fioles.replay(`c:${level}`, encodeActions(win))).toEqual({ finished: true, value: OPTIMAL[level - 1] });
  });

  it.each([1, 10, 50, 100])('correspond à la recherche exhaustive au niveau %i', (level) => {
    expect(minimalMoves(fiolesLevel(level), 5_000_000)).toBe(OPTIMAL[level - 1]);
  });
});
