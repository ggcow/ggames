// Indicateur d'avancement d'une grille de Pandas, pour l'aperçu d'un joueur en direct.

import { canStillWin, type Grid, isSolved, type Pandas } from '../../../shared/games/pandas/rules.ts';
import type { LiveStatus } from '../client-game.ts';

/**
 * Situation d'un joueur en direct : `start` avant le premier coup, `stuck` dès qu'un panda posé empêche de
 * finir (la solution est unique : un seul panda mal placé suffit), `close` quand il ne manque que deux pandas
 * au plus, `far` sinon.
 */
export function pandasStatus(grid: Grid, pandas: Pandas, moves: number): LiveStatus {
  if (isSolved(grid, pandas)) return 'close';
  if (moves === 0) return 'start';
  if (!canStillWin(grid, pandas)) return 'stuck';
  return grid.size - pandas.length <= 2 ? 'close' : 'far';
}
