import { describe, expect, it } from 'vitest';
import { MAX_LEVEL } from '../../src/shared/games/campaign.ts';
import { generateLevel, generateLevels, sizeOfLevel } from '../../src/shared/games/pandas/generate.ts';
import { LEVELS } from '../../src/shared/games/pandas/levels.ts';
import { findSolutions, gridToString, MAX_SIZE, MIN_SIZE, parseGrid } from '../../src/shared/games/pandas/rules.ts';

describe('campagne', () => {
  it('agrandit la grille par paliers, de 5 à 10 cases de côté', () => {
    expect([1, 10, 11, 25, 26, 45, 46, 65, 66, 85, 86, 100].map(sizeOfLevel)).toEqual([
      5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10,
    ]);
  });

  it('reproduit les niveaux enregistrés', () => {
    expect(generateLevels(3, () => undefined)).toEqual(LEVELS.slice(0, 3));
    for (const level of [11, 26, 46]) expect(gridToString(generateLevel(level))).toBe(LEVELS[level - 1]);
  });

  it('enregistre cent grilles valides, distinctes, de la bonne taille, chacune avec une seule solution', () => {
    expect(LEVELS).toHaveLength(MAX_LEVEL);
    expect(new Set(LEVELS).size).toBe(MAX_LEVEL);
    LEVELS.forEach((text, index) => {
      const grid = parseGrid(text);
      expect(grid?.size).toBe(sizeOfLevel(index + 1));
      expect(grid?.size).toBeGreaterThanOrEqual(MIN_SIZE);
      expect(grid?.size).toBeLessThanOrEqual(MAX_SIZE);
      if (grid) expect(findSolutions(grid, 2).solutions).toHaveLength(1);
    });
  });
});
