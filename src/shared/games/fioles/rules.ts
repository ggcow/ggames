// Règles du jeu Fioles : verser des boules de couleur jusqu'à ce que chaque fiole soit d'une seule couleur.
// Code pur, sans DOM ni Cloudflare : utilisé par le client, le serveur et les tests.

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

/** Générateur pseudo-aléatoire mulberry32 : même suite sur tous les appareils pour une graine donnée. */
export function createRandom(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
 * Recherche en profondeur avec mémorisation des états.
 * `true` : solution trouvée. `false` : impossible, ou plus de `limit` états explorés.
 */
export function isSolvable(start: ReadonlyBoard, limit: number): boolean {
  const seen = new Set<string>([stateKey(start)]);
  const stack: Board[] = [cloneBoard(start)];
  let explored = 0;
  for (let board = stack.pop(); board; board = stack.pop()) {
    if (isSolved(board)) return true;
    if (++explored > limit) return false;
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
  return false;
}

/* ---------- Génération ---------- */

/** Mélange vérifié par le solveur. Même résultat pour une même graine. */
export function generateBoard(colors: number, empty: number, seed: number): Board {
  let candidate: Board = [];
  for (let attempt = 0; attempt < 25; attempt++) {
    const random = createRandom(seed * 131 + attempt);
    const balls: Color[] = [];
    for (let color = 0; color < colors; color++) for (let k = 0; k < CAP; k++) balls.push(color);
    for (let i = balls.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [balls[i], balls[j]] = [balls[j] as Color, balls[i] as Color];
    }
    candidate = [];
    for (let i = 0; i < colors; i++) candidate.push(balls.slice(i * CAP, i * CAP + CAP));
    for (let i = 0; i < empty; i++) candidate.push([]);
    if (!candidate.some(isTubeDone) && isSolvable(candidate, 30_000)) return candidate;
  }
  return candidate;
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
