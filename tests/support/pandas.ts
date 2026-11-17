// Aides de test pour Pandas : grille enregistrée d'un niveau et replay gagnant valide.

import { levelGrid } from '../../src/shared/games/pandas/definition.ts';
import { findSolutions, type Grid, type Pandas } from '../../src/shared/games/pandas/rules.ts';

/** Grille enregistrée d'un niveau de la campagne, qui doit exister. */
export function pandasLevel(level: number): Grid {
  const grid = levelGrid(level);
  if (!grid) throw new Error(`niveau ${level} absent`);
  return grid;
}

/** Les pandas de la solution d'une grille. */
export function pandasSolution(grid: Grid): Pandas {
  const [solution] = findSolutions(grid, 1).solutions;
  if (!solution) throw new Error('grille sans solution');
  return solution;
}

/** Cases à toucher pour gagner le niveau `level` : chaque panda de la solution, directement. */
export const pandasWin = (level: number): number[] => [...pandasSolution(pandasLevel(level))];
