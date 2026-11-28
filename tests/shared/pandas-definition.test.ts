import { describe, expect, it } from 'vitest';
import {
  attempt,
  decodeActions,
  encodeActions,
  isLost,
  LOSS_COOLDOWN_MS,
  levelGrid,
  OPEN_LEVELS,
  pandas,
  playActions,
  solutionOf,
  startGrid,
} from '../../src/shared/games/pandas/definition.ts';
import { LEVEL_COUNT } from '../../src/shared/games/pandas/rules.ts';
import { pandasLevel, pandasWin } from '../support/pandas.ts';

// Niveau 1, 5 × 5 : solution 1, 8, 10, 17, 24 ; les cases 0, 2 et 3 sont fausses.
const grid = pandasLevel(1);
const solution = solutionOf(grid);
const START = { pandas: [], misses: [] };

describe('tentatives', () => {
  it('trouve la solution unique d’une grille enregistrée', () => {
    expect(solution).toEqual([1, 8, 10, 17, 24]);
  });

  it('pose un panda sur une case de la solution, et note l’erreur ailleurs', () => {
    expect(attempt(grid, solution, START, 8)).toEqual({ pandas: [8], misses: [] });
    expect(attempt(grid, solution, { pandas: [8], misses: [] }, 1)).toEqual({ pandas: [1, 8], misses: [] });
    expect(attempt(grid, solution, START, 0)).toEqual({ pandas: [], misses: [0] });
  });

  it('refuse une case déjà tentée ou hors de la grille', () => {
    expect(attempt(grid, solution, { pandas: [8], misses: [] }, 8)).toBeNull();
    expect(attempt(grid, solution, START, 25)).toBeNull();
    expect(attempt(grid, solution, START, -1)).toBeNull();
  });

  it('perd la partie à la première erreur, et refuse toute tentative ensuite ou après la victoire', () => {
    const lost = { pandas: [8], misses: [0] };
    expect(isLost({ pandas: [8], misses: [] })).toBe(false);
    expect(isLost(lost)).toBe(true);
    expect(attempt(grid, solution, lost, 1)).toBeNull();
    expect(attempt(grid, solution, lost, 2)).toBeNull();
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
    expect(playActions(grid, [0, 8])).toBeNull();
    expect(playActions(grid, [25])).toBeNull();
  });
});

describe('définition', () => {
  it('donne la grille de chaque niveau de la campagne', () => {
    expect(levelGrid(1)?.size).toBe(5);
    expect(levelGrid(100)?.size).toBe(10);
    expect(levelGrid(LEVEL_COUNT)?.size).toBe(10);
    expect(levelGrid(LEVEL_COUNT + 1)).toBeNull();
    expect(startGrid('c:1')).toEqual(levelGrid(1));
    expect(startGrid('c:120')).toEqual(levelGrid(LEVEL_COUNT));
    expect(startGrid('x:1')).toBeNull();
  });

  it('valide les clés et ouvre toujours les trois premiers niveaux pas encore gagnés', () => {
    const open = (won: readonly number[]) =>
      Array.from({ length: LEVEL_COUNT }, (_, i) => i + 1).filter((level) =>
        pandas.isUnlocked(`c:${level}`, new Set(won.map((n) => `c:${n}`))),
      );
    expect(pandas.isValidKey('c:1')).toBe(true);
    expect(pandas.isValidKey('c:120')).toBe(true);
    expect(pandas.isValidKey('c:121')).toBe(false);
    expect(OPEN_LEVELS).toBe(3);
    expect(open([])).toEqual([1, 2, 3]);
    expect(open([1, 2])).toEqual([1, 2, 3, 4, 5]);
    // Les niveaux déjà gagnés plus loin restent ouverts et ne comptent pas parmi les trois.
    expect(open([1, 3])).toEqual([1, 2, 3, 4, 5]);
    expect(open([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 21, 22, 73])).toEqual([
      ...Array.from({ length: 13 }, (_, i) => i + 1),
      21,
      22,
      73,
    ]);
    expect(open([2, 3, 4, 6])).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(open(Array.from({ length: LEVEL_COUNT - 1 }, (_, i) => i + 1))).toHaveLength(LEVEL_COUNT);
    expect(pandas.isUnlocked('c:121', new Set())).toBe(false);
  });

  it('bloque un niveau trente minutes après une défaite', () => {
    expect(pandas.lossCooldownMs).toBe(LOSS_COOLDOWN_MS);
    expect(LOSS_COOLDOWN_MS).toBe(30 * 60 * 1000);
  });

  it('reconnaît une victoire, sans erreur, et n’a pas de meilleur score possible', () => {
    expect(pandas.replay('c:30', encodeActions(pandasWin(30)))).toEqual({ finished: true, value: 0 });
    expect(pandas.replay('c:1', encodeActions([0, ...pandasWin(1)]))).toBeNull();
    expect(pandas.bestPossible('c:30')).toBeNull();
  });

  it('reconnaît une partie perdue ou pas finie, et refuse un replay impossible', () => {
    expect(pandas.replay('c:1', encodeActions([8, 0]))).toEqual({ finished: false, value: 1 });
    expect(pandas.replay('c:1', encodeActions([8, 1]))).toEqual({ finished: false, value: 0 });
    expect(pandas.replay('c:1', encodeActions([0, 2]))).toBeNull();
    expect(pandas.replay('c:1', encodeActions([...pandasWin(1), 0]))).toBeNull();
    expect(pandas.replay('c:1', 'zz')).toBeNull();
    expect(pandas.replay('x:1', '')).toBeNull();
  });
});
