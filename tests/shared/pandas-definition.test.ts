import { describe, expect, it } from 'vitest';
import {
  decodeActions,
  encodeActions,
  levelGrid,
  type PandasAction,
  pandas,
  playActions,
  startGrid,
} from '../../src/shared/games/pandas/definition.ts';
import { pandasLevel, pandasWin } from '../support/pandas.ts';

describe('replays', () => {
  it('encode chaque action sur deux chiffres, et une annulation sur une lettre', () => {
    const actions: PandasAction[] = [{ type: 'toggle', cell: 7 }, { type: 'undo' }, { type: 'toggle', cell: 42 }];
    expect(encodeActions(actions)).toBe('07u42');
    expect(decodeActions('07u42')).toEqual(actions);
    expect(decodeActions('')).toEqual([]);
  });

  it('refuse un replay mal écrit', () => {
    expect(decodeActions('7')).toBeNull();
    expect(decodeActions('0a')).toBeNull();
    expect(decodeActions('x1')).toBeNull();
  });

  it('rejoue pose, retrait et annulation, et refuse une action impossible', () => {
    const grid = pandasLevel(1);
    expect(playActions(grid, decodeActions('0303u') ?? [])).toEqual([[], [3], [], [3]]);
    expect(playActions(grid, [{ type: 'undo' }])).toBeNull();
    expect(playActions(grid, [{ type: 'toggle', cell: 25 }])).toBeNull();
  });
});

describe('définition', () => {
  it('donne la grille de chaque niveau de la campagne', () => {
    expect(levelGrid(1)?.size).toBe(5);
    expect(levelGrid(100)?.size).toBe(10);
    expect(levelGrid(101)).toBeNull();
    expect(startGrid('c:1')).toEqual(levelGrid(1));
    expect(startGrid('x:1')).toBeNull();
  });

  it('valide les clés et suit la progression de la campagne', () => {
    expect(pandas.isValidKey('c:1')).toBe(true);
    expect(pandas.isValidKey('c:101')).toBe(false);
    expect(pandas.isUnlocked('c:2', new Set(['c:1']))).toBe(true);
    expect(pandas.isUnlocked('c:3', new Set(['c:1']))).toBe(false);
  });

  it('compte une victoire directe au meilleur score possible : un coup par ligne', () => {
    const win = pandasWin(30);
    expect(pandas.replay('c:30', encodeActions(win))).toEqual({ finished: true, value: win.length });
    expect(pandas.bestPossible('c:30')).toBe(win.length);
    expect(pandas.bestPossible('x:1')).toBeNull();
  });

  it('compte chaque essai et chaque retrait, et retire un coup par annulation', () => {
    const [first, ...rest] = pandasWin(1);
    if (!first) throw new Error('solution vide');
    const wrong: PandasAction = { type: 'toggle', cell: first.type === 'toggle' && first.cell === 1 ? 2 : 1 };
    const withRetry = [wrong, wrong, first, ...rest];
    expect(pandas.replay('c:1', encodeActions(withRetry))).toEqual({ finished: true, value: 7 });
    const withUndo = [wrong, { type: 'undo' } as const, first, ...rest];
    expect(pandas.replay('c:1', encodeActions(withUndo))).toEqual({ finished: true, value: 5 });
  });

  it('refuse une action après la victoire et dit quand la grille n’est pas résolue', () => {
    const win = pandasWin(1);
    expect(pandas.replay('c:1', `${encodeActions(win)}u`)).toBeNull();
    expect(pandas.replay('c:1', encodeActions(win.slice(0, 3)))).toEqual({ finished: false, value: 3 });
    expect(pandas.replay('c:1', 'zz')).toBeNull();
    expect(pandas.replay('x:1', '')).toBeNull();
  });
});
