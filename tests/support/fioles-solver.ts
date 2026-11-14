// Solveur de test : renvoie une suite de versements qui résout le plateau (recherche en largeur).
// Sert à produire des replays gagnants valides dans les tests.

import { type FiolesAction, levelBoard } from '../../src/shared/games/fioles/definition.ts';
import { type Board, cloneBoard, isSolved, pour, type ReadonlyBoard } from '../../src/shared/games/fioles/rules.ts';

export function solve(start: ReadonlyBoard, limit = 200_000): FiolesAction[] | null {
  const key = (b: ReadonlyBoard) => b.map((t) => t.join(',')).join('|');
  const queue: { board: Board; path: FiolesAction[] }[] = [{ board: cloneBoard(start), path: [] }];
  const seen = new Set([key(start)]);
  for (let i = 0; i < queue.length && i < limit; i++) {
    const current = queue[i];
    if (!current) break;
    if (isSolved(current.board)) return current.path;
    current.board.forEach((_, from) => {
      current.board.forEach((__, to) => {
        const next = cloneBoard(current.board);
        if (pour(next, from, to) === 0) return;
        const k = key(next);
        if (seen.has(k)) return;
        seen.add(k);
        queue.push({ board: next, path: [...current.path, { type: 'pour', from, to }] });
      });
    });
  }
  return null;
}

/** Plateau enregistré d'un niveau de la campagne, qui doit exister. */
export function fiolesLevel(level: number): Board {
  const board = levelBoard(level);
  if (!board) throw new Error(`niveau ${level} absent`);
  return board;
}
