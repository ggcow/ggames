import { describe, expect, it } from 'vitest';
import {
  decodeActions,
  encodeActions,
  levelGrid,
  pandas,
  playActions,
  startGrid,
} from '../../src/shared/games/pandas/definition.ts';
import { pandasLevel, pandasWin } from '../support/pandas.ts';

describe('replays', () => {
  it('encode chaque case touchée sur deux chiffres', () => {
    expect(encodeActions([7, 42, 0])).toBe('074200');
    expect(decodeActions('074200')).toEqual([7, 42, 0]);
    expect(decodeActions('')).toEqual([]);
  });

  it('refuse un replay mal écrit', () => {
    expect(decodeActions('7')).toBeNull();
    expect(decodeActions('0a')).toBeNull();
    expect(decodeActions('07u')).toBeNull();
  });

  it('pose puis retire un panda, et refuse une case hors de la grille', () => {
    const grid = pandasLevel(1);
    expect(playActions(grid, [3, 3, 8])).toEqual([[], [3], [], [8]]);
    expect(playActions(grid, [3, 25])).toBeNull();
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

  it('reconnaît une victoire et n’a pas de meilleur score possible : seule la réussite compte', () => {
    const win = pandasWin(30);
    expect(pandas.replay('c:30', encodeActions(win))).toEqual({ finished: true, value: win.length });
    expect(pandas.bestPossible('c:30')).toBeNull();
  });

  it('compte chaque case touchée, essais et retraits compris', () => {
    const [first, ...rest] = pandasWin(1);
    if (first === undefined) throw new Error('solution vide');
    const wrong = first === 1 ? 2 : 1;
    expect(pandas.replay('c:1', encodeActions([wrong, wrong, first, ...rest]))).toEqual({ finished: true, value: 7 });
  });

  it('refuse une case touchée après la victoire et dit quand la grille n’est pas résolue', () => {
    const win = pandasWin(1);
    expect(pandas.replay('c:1', encodeActions([...win, 0]))).toBeNull();
    expect(pandas.replay('c:1', encodeActions(win.slice(0, 3)))).toEqual({ finished: false, value: 3 });
    expect(pandas.replay('c:1', 'zz')).toBeNull();
    expect(pandas.replay('x:1', '')).toBeNull();
  });
});
