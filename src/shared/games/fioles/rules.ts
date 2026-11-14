// Règles du jeu Fioles : verser des boules de couleur jusqu'à ce que chaque fiole soit d'une seule couleur.
// Code pur, sans DOM ni Cloudflare : utilisé par le client, le serveur et les tests.

import { createRandom, shuffle } from '../random.ts';

/** Nombre de boules par fiole. */
export const CAP = 4;

/** Couleurs affichées. L'index dans ce tableau est la couleur stockée dans les fioles. */
export const COLORS = [
  '#ef4444',
  '#3b82f6',
  '#22c55e',
  '#facc15',
  '#a855f7',
  '#f97316',
  '#f9a8d4',
  '#22d3ee',
  '#92400e',
  '#f5f5f4',
  '#4338ca',
  '#a3e635',
] as const;

export const MAX_COLORS = COLORS.length;
export const MIN_TUBES = 3;
export const MAX_TUBES = 16;

/** Une lettre par couleur pour l'encodage texte (index = couleur). */
const LETTERS = 'abcdefghijkl';

/** Index de couleur, de 0 à MAX_COLORS - 1. */
export type Color = number;
/** Une fiole : couleurs du fond vers le haut, longueur 0..CAP. */
export type Tube = Color[];
export type Board = Tube[];
export type ReadonlyBoard = readonly (readonly Color[])[];

/* ---------- Utilitaires ---------- */

export const cloneBoard = (board: ReadonlyBoard): Board => board.map((tube) => [...tube]);

/* ---------- Règles ---------- */

export const topOf = (tube: readonly Color[]): Color | undefined => tube[tube.length - 1];

export const isTubeDone = (tube: readonly Color[]): boolean =>
  tube.length === CAP && tube.every((color) => color === tube[0]);

export const isSolved = (board: ReadonlyBoard): boolean => board.every((tube) => tube.length === 0 || isTubeDone(tube));

export function canPour(from: readonly Color[], to: readonly Color[]): boolean {
  if (from.length === 0 || to.length >= CAP) return false;
  return to.length === 0 || topOf(to) === topOf(from);
}

/** Verse la fiole `from` dans la fiole `to` (modifie `board`). Retourne le nombre de boules déplacées. */
export function pour(board: Board, from: number, to: number): number {
  const source = board[from];
  const target = board[to];
  if (from === to || !source || !target || !canPour(source, target)) return 0;
  const color = topOf(source);
  let moved = 0;
  while (topOf(source) === color && target.length < CAP) {
    target.push(source.pop() as Color);
    moved++;
  }
  return moved;
}

/* ---------- Solveur ---------- */

const stateKey = (board: ReadonlyBoard): string =>
  board
    .map((tube) => tube.map((color) => LETTERS[color]).join(''))
    .sort()
    .join('|');

/**
 * Effort du solveur : nombre d'états explorés (recherche en profondeur avec mémorisation) avant de trouver
 * une solution. `null` si le plateau est impossible ou demande plus de `limit` états.
 * Sert à vérifier qu'un plateau est faisable et à estimer sa difficulté.
 */
export function solverEffort(start: ReadonlyBoard, limit: number): number | null {
  const seen = new Set<string>([stateKey(start)]);
  const stack: Board[] = [cloneBoard(start)];
  let explored = 0;
  for (let board = stack.pop(); board; board = stack.pop()) {
    if (isSolved(board)) return explored;
    if (++explored > limit) return null;
    const towardEmpty: Board[] = [];
    const towardColor: Board[] = [];
    board.forEach((source, from) => {
      if (source.length === 0 || isTubeDone(source)) return;
      const uniform = source.every((color) => color === source[0]);
      board.forEach((target, to) => {
        if (from === to || !canPour(source, target)) return;
        if (target.length === 0 && uniform) return; // déplacer une fiole unie vers une vide ne sert à rien
        const next = cloneBoard(board);
        pour(next, from, to);
        const key = stateKey(next);
        if (seen.has(key)) return;
        seen.add(key);
        (target.length > 0 ? towardColor : towardEmpty).push(next);
      });
    });
    stack.push(...towardEmpty, ...towardColor); // pile : les coups vers une même couleur sont explorés en premier
  }
  return null;
}

export const isSolvable = (start: ReadonlyBoard, limit: number): boolean => solverEffort(start, limit) !== null;

/* ---------- Génération ---------- */

/** Paramètres d'un plateau généré. */
export interface BoardSpec {
  colors: number;
  empty: number;
  /** Refuser les plateaux dont une fiole commence avec deux boules identiques côte à côte. */
  noAdjacentPairs: boolean;
  /** Nombre de plateaux faisables à générer ; le plus difficile pour le solveur est retenu. */
  candidates: number;
}

const SOLVER_LIMIT = 30_000;
const MAX_ATTEMPTS = 400;

const hasAdjacentPair = (tube: readonly Color[]): boolean => tube.some((color, i) => i > 0 && tube[i - 1] === color);

function shuffledBoard(colors: number, empty: number, random: () => number): Board {
  const balls: Color[] = [];
  for (let color = 0; color < colors; color++) for (let k = 0; k < CAP; k++) balls.push(color);
  shuffle(balls, random);
  const board: Board = [];
  for (let i = 0; i < colors; i++) board.push(balls.slice(i * CAP, i * CAP + CAP));
  for (let i = 0; i < empty; i++) board.push([]);
  return board;
}

/** Plateau faisable respectant `spec`. Même résultat pour une même graine. */
export function generateBoard(spec: BoardSpec, seed: number): Board {
  let best: { board: Board; effort: number } | null = null;
  let last: Board = [];
  let found = 0;
  for (let attempt = 0; attempt < MAX_ATTEMPTS && found < spec.candidates; attempt++) {
    const board = shuffledBoard(spec.colors, spec.empty, createRandom(seed * 131 + attempt));
    last = board;
    if (board.some(isTubeDone)) continue;
    if (spec.noAdjacentPairs && board.some(hasAdjacentPair)) continue;
    const effort = solverEffort(board, SOLVER_LIMIT);
    if (effort === null) continue;
    found++;
    if (!best || effort > best.effort) best = { board, effort };
  }
  return best?.board ?? last;
}

/* ---------- Encodage texte ---------- */

/** Fioles -> texte, ex. "abca.bcab.cabc.." : une lettre par boule, '.' entre les fioles. */
export const boardToString = (board: ReadonlyBoard): string =>
  board.map((tube) => tube.map((color) => LETTERS[color]).join('')).join('.');

/**
 * Texte -> fioles. `null` si ce n'est pas un plateau valide :
 * MIN_TUBES à MAX_TUBES fioles, au plus CAP boules par fiole, exactement CAP boules de chaque couleur présente.
 */
export function parseBoard(text: string): Board | null {
  if (text.length > MAX_TUBES * (CAP + 1)) return null;
  const board: Board = text.split('.').map((part) => [...part].map((letter) => LETTERS.indexOf(letter)));
  if (board.length < MIN_TUBES || board.length > MAX_TUBES) return null;
  const counts = new Map<Color, number>();
  for (const tube of board) {
    if (tube.length > CAP) return null;
    for (const color of tube) {
      if (color < 0) return null;
      counts.set(color, (counts.get(color) ?? 0) + 1);
    }
  }
  if (counts.size === 0 || ![...counts.values()].every((count) => count === CAP)) return null;
  return board;
}
