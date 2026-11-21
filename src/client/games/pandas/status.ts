// Indicateur d'avancement d'une grille de Pandas, pour l'aperçu d'un joueur en direct.

import type { LiveView } from '../../../shared/games/pandas/rules.ts';
import type { LiveStatus } from '../client-game.ts';

/**
 * Situation d'un joueur en direct, d'après le nombre de bosquets où il a trouvé le panda : `stuck` après une
 * erreur, qui perd la partie, `start` avant la première tentative, `close` quand il ne manque que deux pandas au
 * plus, `far` sinon.
 */
export function pandasStatus(live: LiveView, attempts: number): LiveStatus {
  const { grid, found, misses } = live;
  if (misses > 0) return 'stuck';
  if (found.size === grid.size) return 'close';
  if (attempts === 0) return 'start';
  return grid.size - found.size <= 2 ? 'close' : 'far';
}
