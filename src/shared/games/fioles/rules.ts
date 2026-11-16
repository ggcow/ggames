// Règles du jeu Fioles : verser des boules de couleur jusqu'à ce que chaque fiole soit d'une seule couleur.
// Code pur, sans DOM ni Cloudflare : utilisé par le client, le serveur et les tests.
// La génération des niveaux est dans generate.ts.

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

/* ---------- Recherche d'une solution ---------- */

/** Issue d'une recherche : solution trouvée, plateau prouvé impossible, ou recherche trop longue. */
export type SearchResult = { kind: 'solved'; explored: number } | { kind: 'impossible' } | { kind: 'too-long' };

// L'ordre des fioles ne change rien à la suite de la partie : deux plateaux qui ne diffèrent que par cet
// ordre sont la même position, ce qui évite aussi de tourner en rond.
const positionKey = (board: ReadonlyBoard): string => boardToString(board).split('.').sort().join('|');

/**
 * Recherche en profondeur avec mémorisation des positions vues, coups vers une même couleur d'abord.
 * Explore au plus `limit` positions.
 */
export function searchSolution(start: ReadonlyBoard, limit: number): SearchResult {
  const seen = new Set<string>([positionKey(start)]);
  const stack: Board[] = [cloneBoard(start)];
  let explored = 0;
  for (let board = stack.pop(); board; board = stack.pop()) {
    if (isSolved(board)) return { kind: 'solved', explored };
    if (++explored > limit) return { kind: 'too-long' };
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
        const key = positionKey(next);
        if (seen.has(key)) return;
        seen.add(key);
        (target.length > 0 ? towardColor : towardEmpty).push(next);
      });
    });
    stack.push(...towardEmpty, ...towardColor); // pile : les coups vers une même couleur sont explorés en premier
  }
  return { kind: 'impossible' };
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
