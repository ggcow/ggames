import { describe, expect, it } from 'vitest';
import {
  clash,
  conflicts,
  findSolutions,
  gridToString,
  isSolved,
  liveState,
  parseGrid,
  parseLiveState,
} from '../../src/shared/games/pandas/rules.ts';

// Grille 5 × 5 à solution unique : cases 1, 8, 10, 17, 24 (colonnes 1, 3, 0, 2, 4).
const TEXT = 'aaaaa.aaabb.caabb.ddddb.dddde';

const grid = () => {
  const parsed = parseGrid(TEXT);
  if (!parsed) throw new Error('grille de test invalide');
  return parsed;
};

describe('grille', () => {
  it('lit une grille et la réécrit à l’identique', () => {
    const parsed = grid();
    expect(parsed.size).toBe(5);
    expect(parsed.regions.slice(0, 10)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1, 1]);
    expect(gridToString(parsed)).toBe(TEXT);
  });

  it('refuse une grille trop petite, trop grande, pas carrée ou mal écrite', () => {
    expect(parseGrid('aaaa.abbb.ccbb.dddd')).toBeNull();
    expect(parseGrid(Array.from({ length: 11 }, () => 'a'.repeat(11)).join('.'))).toBeNull();
    expect(parseGrid('aaaaa.aaabb.caabb.ddddb.ddde')).toBeNull();
    expect(parseGrid('aaaaa.aaabb.caabb.ddddb.dddd?')).toBeNull();
    // `f` désigne un sixième bosquet sur une grille de cinq.
    expect(parseGrid('aaaaa.aaabb.caabb.ddddb.ddddf')).toBeNull();
  });

  it('refuse un bosquet absent ou coupé en deux', () => {
    expect(parseGrid('aaaaa.aaabb.aaabb.ddddb.dddde')).toBeNull();
    expect(parseGrid('aaaaa.aaabb.caabb.ddddb.cddde')).toBeNull();
  });
});

describe('règles', () => {
  it('interdit deux pandas sur la même ligne, colonne ou bosquet, ou qui se touchent', () => {
    const g = grid();
    expect(clash(g, 0, 4)).toBe(true);
    expect(clash(g, 0, 20)).toBe(true);
    expect(clash(g, 2, 13)).toBe(false);
    expect(clash(g, 1, 8)).toBe(false);
    // Même bosquet a, lignes et colonnes différentes, sans contact.
    expect(clash(g, 3, 11)).toBe(true);
    // Bosquets différents, mais contact en diagonale.
    expect(clash(g, 7, 13)).toBe(true);
  });

  it('repère les pandas en faute et reconnaît une grille résolue', () => {
    const g = grid();
    expect([...conflicts(g, [1, 4, 10])].sort((a, b) => a - b)).toEqual([1, 4]);
    expect(isSolved(g, [1, 8, 10, 17, 24])).toBe(true);
    expect(isSolved(g, [1, 8, 10, 17])).toBe(false);
  });
});

describe('solutions', () => {
  it('trouve la solution unique, et rien de plus', () => {
    const search = findSolutions(grid(), 2);
    expect(search.solutions).toEqual([[1, 8, 10, 17, 24]]);
    expect(search.nodes).toBeGreaterThan(0);
  });

  it('garde les pandas déjà posés, et ne trouve rien s’ils sont mal placés', () => {
    expect(findSolutions(grid(), 2, [10]).solutions).toEqual([[1, 8, 10, 17, 24]]);
    expect(findSolutions(grid(), 2, [0]).solutions).toEqual([]);
    expect(findSolutions(grid(), 2, [1, 4]).solutions).toEqual([]);
  });
});

describe('état en direct', () => {
  it('écrit en majuscules les bosquets trouvés, sans la case du panda, puis les erreurs, et les relit', () => {
    const state = liveState(grid(), [1, 8, 24], 1);
    expect(state).toBe('AAAAA.AAABB.cAABB.ddddB.ddddE!1');
    const view = parseLiveState(state);
    expect(view?.grid).toEqual(grid());
    expect(view && [...view.found].sort()).toEqual([grid().regions[1], grid().regions[8], grid().regions[24]].sort());
    expect(view?.misses).toBe(1);
    expect(parseLiveState(liveState(grid(), [], 0))).toMatchObject({ found: new Set(), misses: 0 });
  });

  it.each([
    'n’importe quoi',
    'aaaaa.aaabb.caabb.ddddb.dddde',
    'aaaaa.aaabb.caabb.ddddb.dddde!x',
    'aAaaa.aaabb.caabb.ddddb.dddde!0',
  ])('refuse un état illisible ou un bosquet à moitié trouvé : %s', (state) => {
    expect(parseLiveState(state)).toBeNull();
  });
});
