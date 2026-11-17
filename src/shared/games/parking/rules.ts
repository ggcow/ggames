// Règles du jeu Parking : faire glisser les véhicules le long de leur axe pour libérer la sortie de la voiture
// rouge. Code pur, sans DOM ni Cloudflare : utilisé par le client, le serveur et les tests.
// La génération des niveaux est dans generate.ts.

/** Côté du parking, en cases. */
export const SIZE = 6;

/** Rangée de la voiture rouge (0 = en haut) : la sortie s'ouvre au bout de cette rangée, sur le bord droit. */
export const EXIT_ROW = 2;

/** Une lettre par véhicule pour l'encodage texte et les replays, de `a` (la voiture rouge) à `o`. */
export const LETTERS = 'abcdefghijklmno';

/** Véhicules au plus dans un parking : un par lettre. */
export const MAX_VEHICLES = LETTERS.length;

/** Longueur d'une voiture et d'un camion, en cases. */
export const CAR = 2;
export const TRUCK = 3;

/** Index de la voiture rouge, à faire sortir. */
export const RED = 0;

export interface Vehicle {
  readonly horizontal: boolean;
  readonly length: number;
  /** Case de tête : la plus à gauche d'un véhicule horizontal, la plus haute d'un vertical. */
  readonly row: number;
  readonly col: number;
}

/** Véhicules du parking. L'index d'un véhicule est sa lettre dans l'encodage ; l'index 0 est la voiture rouge. */
export type Board = readonly Vehicle[];

/** Un coup : glisser le véhicule `vehicle` de `delta` cases (négatif : vers la gauche ou le haut). */
export interface Slide {
  vehicle: number;
  delta: number;
}

/* ---------- Règles ---------- */

/** Cases occupées par un véhicule (index rangée × SIZE + colonne). */
export function cellsOf(vehicle: Vehicle): number[] {
  const step = vehicle.horizontal ? 1 : SIZE;
  const head = vehicle.row * SIZE + vehicle.col;
  return Array.from({ length: vehicle.length }, (_, i) => head + i * step);
}

/** Véhicule occupant chaque case du parking, -1 pour une case libre. */
export function occupancy(board: Board): Int8Array {
  const cells = new Int8Array(SIZE * SIZE).fill(-1);
  board.forEach((vehicle, index) => {
    for (const cell of cellsOf(vehicle)) cells[cell] = index;
  });
  return cells;
}

/** Glissement possible d'un véhicule : `min` cases au plus vers la gauche ou le haut (négatif), `max` de l'autre côté. */
export function slideRange(board: Board, vehicle: number, cells = occupancy(board)): { min: number; max: number } {
  const v = board[vehicle];
  if (!v) return { min: 0, max: 0 };
  const step = v.horizontal ? 1 : SIZE;
  const head = v.horizontal ? v.col : v.row;
  const first = v.row * SIZE + v.col;
  let min = 0;
  while (head + min > 0 && cells[first + (min - 1) * step] === -1) min--;
  let max = 0;
  while (head + v.length + max < SIZE && cells[first + (v.length + max) * step] === -1) max++;
  return { min, max };
}

/** Parking après le glissement `slide`, ou `null` si le véhicule n'existe pas ou ne peut pas aller jusque-là. */
export function slide(board: Board, { vehicle, delta }: Slide): Board | null {
  const v = board[vehicle];
  if (!v || delta === 0 || !Number.isInteger(delta)) return null;
  const { min, max } = slideRange(board, vehicle);
  if (delta < min || delta > max) return null;
  const moved: Vehicle = v.horizontal ? { ...v, col: v.col + delta } : { ...v, row: v.row + delta };
  return board.map((other, index) => (index === vehicle ? moved : other));
}

/** Vrai quand la voiture rouge touche la sortie : plus rien ne la retient. */
export function isSolved(board: Board): boolean {
  const red = board[RED];
  return red !== undefined && red.col + red.length === SIZE;
}

/** Tous les coups possibles, dans l'ordre des véhicules puis des distances. */
export function possibleSlides(board: Board): Slide[] {
  const cells = occupancy(board);
  const slides: Slide[] = [];
  board.forEach((_, vehicle) => {
    const { min, max } = slideRange(board, vehicle, cells);
    for (let delta = min; delta <= max; delta++) if (delta !== 0) slides.push({ vehicle, delta });
  });
  return slides;
}

/* ---------- Recherche de la solution la plus courte ---------- */

/** Issue d'une recherche : coups de la solution la plus courte, ou raison de l'échec. */
export type SearchResult = { kind: 'solved'; slides: Slide[] } | { kind: 'impossible' } | { kind: 'too-long' };

/** Clé d'une position : la case de tête de chaque véhicule, les seules qui changent d'un coup à l'autre. */
export const positionKey = (board: Board): string =>
  String.fromCharCode(...board.map((vehicle) => vehicle.row * SIZE + vehicle.col));

/**
 * Solution la plus courte (en coups, un glissement de plusieurs cases comptant pour un), par une recherche en
 * largeur. S'arrête sur `too-long` au-delà de `limit` positions explorées ou de `maxMoves` coups.
 */
export function shortestSolution(start: Board, limit: number, maxMoves = Number.POSITIVE_INFINITY): SearchResult {
  const parents = new Map<string, { from: string; slide: Slide } | null>([[positionKey(start), null]]);
  let frontier: Board[] = [start];
  for (let moves = 0; frontier.length > 0; moves++) {
    const solved = frontier.find(isSolved);
    if (solved) return { kind: 'solved', slides: pathTo(positionKey(solved), parents) };
    if (moves >= maxMoves) return { kind: 'too-long' };
    const next: Board[] = [];
    for (const board of frontier) {
      const from = positionKey(board);
      for (const move of possibleSlides(board)) {
        const after = slide(board, move);
        if (!after) continue;
        const key = positionKey(after);
        if (parents.has(key)) continue;
        parents.set(key, { from, slide: move });
        next.push(after);
      }
      if (parents.size > limit) return { kind: 'too-long' };
    }
    frontier = next;
  }
  return { kind: 'impossible' };
}

function pathTo(key: string, parents: ReadonlyMap<string, { from: string; slide: Slide } | null>): Slide[] {
  const slides: Slide[] = [];
  for (let step = parents.get(key); step; step = parents.get(step.from)) slides.push(step.slide);
  return slides.reverse();
}

/* ---------- Encodage texte ---------- */

/** Parking -> texte de SIZE × SIZE caractères, rangée par rangée : la lettre du véhicule, ou `.` si la case est libre. */
export function boardToString(board: Board): string {
  const cells = occupancy(board);
  return Array.from(cells, (index) => (index === -1 ? '.' : LETTERS[index])).join('');
}

/**
 * Texte -> parking. `null` si ce n'est pas un parking valide : SIZE × SIZE cases, lettres utilisées dans l'ordre
 * à partir de `a`, chaque véhicule en ligne droite de CAR ou TRUCK cases, la voiture rouge (`a`) horizontale,
 * de CAR cases, sur la rangée de la sortie.
 */
export function parseBoard(text: string): Board | null {
  if (text.length !== SIZE * SIZE) return null;
  const cells = new Map<number, number[]>();
  for (let cell = 0; cell < text.length; cell++) {
    const char = text[cell] ?? '';
    if (char === '.') continue;
    const index = LETTERS.indexOf(char);
    if (index === -1) return null;
    cells.set(index, [...(cells.get(index) ?? []), cell]);
  }
  const board: Vehicle[] = [];
  for (let index = 0; index < cells.size; index++) {
    const vehicle = vehicleAt(cells.get(index) ?? []);
    if (!vehicle) return null;
    board.push(vehicle);
  }
  const red = board[RED];
  if (!red?.horizontal || red.length !== CAR || red.row !== EXIT_ROW) return null;
  return board;
}

/** Véhicule formé par des cases (en ordre croissant), ou `null` si elles ne forment pas une ligne droite valide. */
function vehicleAt(cells: readonly number[]): Vehicle | null {
  const [head, second] = cells;
  if (head === undefined || second === undefined || cells.length > TRUCK) return null;
  const horizontal = second === head + 1;
  const step = horizontal ? 1 : SIZE;
  const row = Math.floor(head / SIZE);
  const col = head % SIZE;
  if (!cells.every((cell, i) => cell === head + i * step)) return null;
  if (horizontal && col + cells.length > SIZE) return null;
  return { horizontal, length: cells.length, row, col };
}
