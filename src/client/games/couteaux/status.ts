// Indicateur d'avancement d'une partie de Couteaux, pour l'aperçu d'un joueur en direct.

import { type Level, type LiveView, room } from '../../../shared/games/couteaux/rules.ts';
import type { LiveStatus } from '../client-game.ts';

/** Couteaux restant à planter au plus pour dire qu'un joueur touche au but. */
export const CLOSE_KNIVES = 2;

/**
 * Situation d'un joueur en direct : `start` avant le premier lancer, `stuck` quand les espaces libres de la
 * planète ne peuvent plus recevoir tous les couteaux qui restent, `close` quand il en reste CLOSE_KNIVES au plus,
 * `far` sinon.
 */
export function couteauxStatus(level: Level, live: LiveView, throws: number): LiveStatus {
  const left = level.knives - live.planted.length;
  if (left <= 0) return 'close';
  if (throws === 0) return 'start';
  if (room(level, live.planted) < left) return 'stuck';
  return left <= CLOSE_KNIVES ? 'close' : 'far';
}
