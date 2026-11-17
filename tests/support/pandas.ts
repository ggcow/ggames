// Aides de test pour Pandas : grille enregistrée d'un niveau et replay gagnant valide.

import { levelGrid, type PandasAction } from '../../src/shared/games/pandas/definition.ts';
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

/** Actions qui gagnent le niveau `level` en posant directement chaque panda de la solution. */
export const pandasWin = (level: number): PandasAction[] =>
  pandasSolution(pandasLevel(level)).map((cell) => ({ type: 'toggle', cell }));
