// Aides de test pour Parking : parking enregistré d'un niveau et replay gagnant valide.

import { levelBoard, type ParkingAction } from '../../src/shared/games/parking/definition.ts';
import { type Board, shortestSolution } from '../../src/shared/games/parking/rules.ts';

/** Parking enregistré d'un niveau de la campagne, qui doit exister. */
export function parkingLevel(level: number): Board {
  const board = levelBoard(level);
  if (!board) throw new Error(`niveau ${level} absent`);
  return board;
}

/** Actions de la solution la plus courte d'un parking. */
export function parkingSolution(board: Board): ParkingAction[] {
  const result = shortestSolution(board, 1_000_000);
  if (result.kind !== 'solved') throw new Error('parking sans solution');
  return result.slides.map((slide) => ({ type: 'slide', ...slide }));
}

/** Actions qui gagnent le niveau `level` en un minimum de coups. */
export const parkingWin = (level: number): ParkingAction[] => parkingSolution(parkingLevel(level));
