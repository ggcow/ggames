// Aides de test pour Bouquets : plateau enregistré d'un niveau et replay gagnant valide.

import { type BouquetsAction, levelBoard } from '../../src/shared/games/bouquets/definition.ts';
import { solve } from '../../src/shared/games/bouquets/generate.ts';
import type { Board } from '../../src/shared/games/bouquets/rules.ts';

/** Plateau enregistré d'un niveau de la campagne, qui doit exister. */
export function bouquetsLevel(level: number): Board {
  const board = levelBoard(level);
  if (!board) throw new Error(`niveau ${level} absent`);
  return board;
}

/** Actions qui gagnent le niveau `level`, trouvées par le solveur du générateur. */
export function bouquetsWin(level: number): BouquetsAction[] {
  const moves = solve(bouquetsLevel(level), 60_000);
  if (!moves) throw new Error(`niveau ${level} sans solution`);
  return moves.map((move) => ({ type: 'move', ...move }));
}
