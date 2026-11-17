// Indicateur d'avancement d'un parking, pour l'aperçu d'un joueur en direct.

import { type Board, isSolved, shortestSolution } from '../../../shared/games/parking/rules.ts';
import type { LiveStatus } from '../client-game.ts';

/** Coups restants au plus pour dire qu'un joueur touche au but. */
export const CLOSE_MOVES = 3;

/**
 * Positions explorées au plus pour compter les coups restants : la recherche reste courte sur un téléphone, à
 * chaque coup d'un adversaire. Au-delà, le joueur a encore du chemin.
 */
export const CLOSE_LIMIT = 5_000;

/**
 * Situation d'un joueur en direct : `start` avant le premier coup, `close` quand la voiture rouge sort en
 * CLOSE_MOVES coups au plus, `far` sinon. Jamais d'impasse : chaque coup se défait, la sortie reste toujours
 * accessible.
 */
export function parkingStatus(board: Board, moves: number): LiveStatus {
  if (isSolved(board)) return 'close';
  if (moves === 0) return 'start';
  return shortestSolution(board, CLOSE_LIMIT, CLOSE_MOVES).kind === 'solved' ? 'close' : 'far';
}
