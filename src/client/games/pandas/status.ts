// Indicateur d'avancement d'une grille de Pandas, pour l'aperçu d'un joueur en direct.

import type { Grid } from '../../../shared/games/pandas/rules.ts';
import type { LiveStatus } from '../client-game.ts';

/**
 * Situation d'un joueur en direct, d'après le nombre de bosquets où il a trouvé le panda : `start` avant la
 * première tentative, `close` quand il ne manque que deux pandas au plus, `far` sinon. Jamais d'impasse : seul un
 * panda bien placé reste sur la grille.
 */
export function pandasStatus(grid: Grid, found: number, attempts: number): LiveStatus {
  if (found === grid.size) return 'close';
  if (attempts === 0) return 'start';
  return grid.size - found <= 2 ? 'close' : 'far';
}
