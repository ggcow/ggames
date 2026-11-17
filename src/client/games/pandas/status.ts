// Indicateur d'avancement d'une grille de Pandas, pour l'aperçu d'un joueur en direct.

import { type Grid, isSolved, type Pandas } from '../../../shared/games/pandas/rules.ts';
import type { LiveStatus } from '../client-game.ts';

/**
 * Situation d'un joueur en direct : `start` avant la première tentative, `close` quand il ne manque que deux
 * pandas au plus, `far` sinon. Jamais d'impasse : seul un panda bien placé reste sur la grille.
 */
export function pandasStatus(grid: Grid, pandas: Pandas, attempts: number): LiveStatus {
  if (isSolved(grid, pandas)) return 'close';
  if (attempts === 0) return 'start';
  return grid.size - pandas.length <= 2 ? 'close' : 'far';
}
