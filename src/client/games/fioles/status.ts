// Indicateur d'avancement d'un plateau de Fioles, pour l'aperçu d'un joueur en direct.

import { isSolved, isTubeDone, type ReadonlyBoard, searchSolution } from '../../../shared/games/fioles/rules.ts';
import type { LiveStatus } from '../client-game.ts';

/**
 * Positions explorées au plus pour prouver qu'un plateau ne peut plus être gagné. Au-delà, le joueur a
 * encore assez de coups devant lui pour qu'on ne parle pas d'impasse ; le calcul reste court sur un
 * téléphone, à chaque coup d'un adversaire.
 */
export const DEAD_END_LIMIT = 300;

/** Fioles encore mélangées : ni vides ni terminées. */
const mixedTubes = (board: ReadonlyBoard): number =>
  board.filter((tube) => tube.length > 0 && !isTubeDone(tube)).length;

/**
 * Situation d'un joueur en direct : `start` avant le premier coup, `stuck` quand plus aucune suite de
 * versements ne mène à la victoire, `close` quand il ne reste que deux fioles mélangées ou que les fioles
 * terminées sont deux fois plus nombreuses que les mélangées, `far` sinon.
 */
export function boardStatus(board: ReadonlyBoard, moves: number): LiveStatus {
  if (isSolved(board)) return 'close';
  if (moves === 0) return 'start';
  if (searchSolution(board, DEAD_END_LIMIT).kind === 'impossible') return 'stuck';
  const mixed = mixedTubes(board);
  if (mixed <= 2) return 'close';
  const done = board.filter(isTubeDone).length;
  return done >= mixed * 2 ? 'close' : 'far';
}
