// Indicateur d'avancement d'une partie de Bouquets, pour l'aperçu d'un joueur en direct.

import { hasMove, type LivePot } from '../../../shared/games/bouquets/rules.ts';
import type { LiveStatus } from '../client-game.ts';

/** Fleurs au plus, sur des devants sans couche cachée, pour être proche de la fin. */
const CLOSE_FLOWERS = 9;

/**
 * Situation d'un joueur en direct, d'après ce qu'on voit de ses pots : `start` avant le premier coup, `stuck`
 * quand plus aucun déplacement n'est possible, `close` quand il ne reste aucune couche cachée et au plus neuf
 * fleurs, `far` sinon.
 */
export function potsStatus(pots: readonly LivePot[], moves: number): LiveStatus {
  const flowers = pots.reduce((n, pot) => n + pot.front.filter((slot) => slot !== null).length, 0);
  const hidden = pots.reduce((n, pot) => n + pot.hidden, 0);
  if (flowers === 0 && hidden === 0) return 'close';
  if (moves === 0) return 'start';
  if (!hasMove(pots.map((pot) => [pot.front]))) return 'stuck';
  return hidden === 0 && flowers <= CLOSE_FLOWERS ? 'close' : 'far';
}
