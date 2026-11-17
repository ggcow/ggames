import { describe, expect, it } from 'vitest';
import {
  attempt,
  decodeActions,
  encodeActions,
  isLost,
  LIVES,
  levelGrid,
  pandas,
  playActions,
  solutionOf,
  startGrid,
} from '../../src/shared/games/pandas/definition.ts';
import { pandasLevel, pandasWin } from '../support/pandas.ts';

// Niveau 1, 5 × 5 : solution 1, 8, 10, 17, 24 ; les cases 0, 2 et 3 sont fausses.
const grid = pandasLevel(1);
const solution = solutionOf(grid);
const START = { pandas: [], misses: [] };

describe('tentatives', () => {
  it('trouve la solution unique d’une grille enregistrée', () => {
    expect(solution).toEqual([1, 8, 10, 17, 24]);
  });

  it('pose un panda sur une case de la solution, et compte une erreur ailleurs', () => {
    expect(attempt(grid, solution, START, 8)).toEqual({ pandas: [8], misses: [] });
    expect(attempt(grid, solution, { pandas: [8], misses: [] }, 1)).toEqual({ pandas: [1, 8], misses: [] });
    expect(attempt(grid, solution, START, 0)).toEqual({ pandas: [], misses: [0] });
  });

  it('refuse une case déjà tentée ou hors de la grille', () => {
    expect(attempt(grid, solution, { pandas: [8], misses: [0] }, 8)).toBeNull();
    expect(attempt(grid, solution, { pandas: [8], misses: [0] }, 0)).toBeNull();
    expect(attempt(grid, solution, START, 25)).toBeNull();
  });

  it('perd la partie à la troisième erreur, et refuse toute tentative ensuite ou après la victoire', () => {
    expect(LIVES).toBe(3);
    const lost = { pandas: [8], misses: [0, 2, 3] };
    expect(isLost({ pandas: [], misses: [0, 2] })).toBe(false);
    expect(isLost(lost)).toBe(true);
    expect(attempt(grid, solution, lost, 1)).toBeNull();
    expect(attempt(grid, solution, { pandas: solution, misses: [] }, 0)).toBeNull();
  });
});

describe('replays', () => {
  it('encode chaque case tentée sur deux chiffres', () => {
    expect(encodeActions([7, 42, 0])).toBe('074200');
    expect(decodeActions('074200')).toEqual([7, 42, 0]);
    expect(decodeActions('')).toEqual([]);
  });

  it('refuse un replay mal écrit', () => {
    expect(decodeActions('7')).toBeNull();
    expect(decodeActions('0a')).toBeNull();
    expect(decodeActions('07u')).toBeNull();
  });

  it('rejoue chaque tentative, et refuse une tentative impossible', () => {
    expect(playActions(grid, [8, 0])).toEqual([START, { pandas: [8], misses: [] }, { pandas: [8], misses: [0] }]);
    expect(playActions(grid, [8, 8])).toBeNull();
    expect(playActions(grid, [25])).toBeNull();
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

  it('reconnaît une victoire, garde le nombre d’erreurs et n’a pas de meilleur score possible', () => {
    expect(pandas.replay('c:30', encodeActions(pandasWin(30)))).toEqual({ finished: true, value: 0 });
    expect(pandas.replay('c:1', encodeActions([0, 2, ...pandasWin(1)]))).toEqual({ finished: true, value: 2 });
    expect(pandas.bestPossible('c:30')).toBeNull();
  });

  it('reconnaît une partie perdue ou pas finie, et refuse un replay impossible', () => {
    expect(pandas.replay('c:1', encodeActions([8, 0, 2, 3]))).toEqual({ finished: false, value: 3 });
    expect(pandas.replay('c:1', encodeActions([8, 1]))).toEqual({ finished: false, value: 0 });
    expect(pandas.replay('c:1', encodeActions([0, 2, 3, 1]))).toBeNull();
    expect(pandas.replay('c:1', encodeActions([...pandasWin(1), 0]))).toBeNull();
    expect(pandas.replay('c:1', 'zz')).toBeNull();
    expect(pandas.replay('x:1', '')).toBeNull();
  });
});
