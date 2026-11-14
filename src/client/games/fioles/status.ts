// Indicateur d'avancement d'un plateau de Fioles, pour l'aperçu d'un joueur en direct.

import { canPour, isSolved, isTubeDone, type ReadonlyBoard } from '../../../shared/games/fioles/rules.ts';
import type { LiveStatus } from '../client-game.ts';

/** Fioles encore mélangées : ni vides ni terminées. */
const mixedTubes = (board: ReadonlyBoard): number =>
  board.filter((tube) => tube.length > 0 && !isTubeDone(tube)).length;

/** Vrai si au moins un versement est encore possible. */
function hasMove(board: ReadonlyBoard): boolean {
  for (let from = 0; from < board.length; from++) {
    const source = board[from] ?? [];
    if (source.length === 0 || isTubeDone(source)) continue;
    for (let to = 0; to < board.length; to++) {
      if (from !== to && canPour(source, board[to] ?? [])) return true;
    }
  }
  return false;
}

/**
 * Situation d'un joueur en direct : `start` avant le premier coup, `stuck` quand plus aucun versement n'est
 * possible, `close` quand il ne reste que deux fioles mélangées ou que les fioles terminées sont deux fois
 * plus nombreuses que les mélangées, `far` sinon.
 */
export function boardStatus(board: ReadonlyBoard, moves: number): LiveStatus {
  if (isSolved(board)) return 'close';
  if (moves === 0) return 'start';
  if (!hasMove(board)) return 'stuck';
  const mixed = mixedTubes(board);
  if (mixed <= 2) return 'close';
  const done = board.filter(isTubeDone).length;
  return done >= mixed * 2 ? 'close' : 'far';
}
