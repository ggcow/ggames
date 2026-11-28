// Règles de Pandas : poser un panda par ligne, par colonne et par bosquet (zone colorée de la grille), sans que
// deux pandas se touchent, même en diagonale. Fonctions pures, partagées par le client et le serveur.

/** Côté de la plus petite et de la plus grande grille : de quoi tenir sur un écran de 375 px. */
export const MIN_SIZE = 5;
export const MAX_SIZE = 10;

/** Niveaux de la campagne : six pages de la grille. */
export const LEVEL_COUNT = 120;

/** Grille d'un niveau : `size` × `size` cases et autant de bosquets. */
export interface Grid {
  readonly size: number;
  /** Bosquet de chaque case (0 à `size` − 1), ligne par ligne. */
  readonly regions: readonly number[];
}

/** Cases des pandas posés (ligne × `size` + colonne), dans l'ordre croissant. */
export type Pandas = readonly number[];

export const rowOf = (cell: number, size: number): number => Math.floor(cell / size);
export const colOf = (cell: number, size: number): number => cell % size;

const LETTERS = 'abcdefghij';

/** Cases voisines d'une case par un côté. */
export function sideNeighbors(cell: number, size: number): number[] {
  const row = rowOf(cell, size);
  const col = colOf(cell, size);
  const neighbors: number[] = [];
  if (row > 0) neighbors.push(cell - size);
  if (row < size - 1) neighbors.push(cell + size);
  if (col > 0) neighbors.push(cell - 1);
  if (col < size - 1) neighbors.push(cell + 1);
  return neighbors;
}

/** Vrai si les cases du bosquet `region` forment un seul morceau. */
export function isRegionConnected(regions: readonly number[], size: number, region: number): boolean {
  const cells = regions.flatMap((value, cell) => (value === region ? [cell] : []));
  const first = cells[0];
  if (first === undefined) return false;
  const seen = new Set([first]);
  const queue = [first];
  for (let cell = queue.pop(); cell !== undefined; cell = queue.pop()) {
    for (const next of sideNeighbors(cell, size)) {
      if (regions[next] === region && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen.size === cells.length;
}

/** Encodage d'une grille : une lettre par case (`a` = bosquet 0), lignes séparées par `.`. Ex. "aab.cab.ccb". */
export function gridToString(grid: Grid): string {
  const rows: string[] = [];
  for (let row = 0; row < grid.size; row++) {
    rows.push(
      grid.regions
        .slice(row * grid.size, (row + 1) * grid.size)
        .map((region) => LETTERS[region] ?? '?')
        .join(''),
    );
  }
  return rows.join('.');
}

/** Grille encodée par `gridToString`, ou `null` si le texte n'en décrit pas une valide. */
export function parseGrid(text: string): Grid | null {
  const rows = text.split('.');
  const size = rows.length;
  if (size < MIN_SIZE || size > MAX_SIZE || rows.some((row) => row.length !== size)) return null;
  const regions: number[] = [];
  for (const char of rows.join('')) {
    const region = LETTERS.indexOf(char);
    if (region === -1 || region >= size) return null;
    regions.push(region);
  }
  for (let region = 0; region < size; region++) {
    if (!isRegionConnected(regions, size, region)) return null;
  }
  return { size, regions };
}

/** Vrai si deux pandas posés sur `a` et `b` enfreignent une règle : même ligne, colonne ou bosquet, ou contact. */
export function clash(grid: Grid, a: number, b: number): boolean {
  const { size } = grid;
  const rowGap = Math.abs(rowOf(a, size) - rowOf(b, size));
  const colGap = Math.abs(colOf(a, size) - colOf(b, size));
  return rowGap === 0 || colGap === 0 || grid.regions[a] === grid.regions[b] || (rowGap <= 1 && colGap <= 1);
}

/** Pandas qui enfreignent une règle avec au moins un autre panda. */
export function conflicts(grid: Grid, pandas: Pandas): Set<number> {
  const found = new Set<number>();
  pandas.forEach((a, index) => {
    for (const b of pandas.slice(index + 1)) {
      if (clash(grid, a, b)) {
        found.add(a);
        found.add(b);
      }
    }
  });
  return found;
}

export const isSolved = (grid: Grid, pandas: Pandas): boolean =>
  pandas.length === grid.size && conflicts(grid, pandas).size === 0;

/** Résultat d'une recherche de solutions : les solutions trouvées et les cases essayées pour les trouver. */
export interface SolutionSearch {
  solutions: Pandas[];
  /** Cases essayées : mesure du travail de la recherche. */
  nodes: number;
}

/**
 * Solutions de la grille qui gardent les pandas `fixed`, jusqu'à `limit` : une ligne après l'autre, chaque panda
 * dans une colonne et un bosquet encore libres et loin du panda de la ligne d'avant.
 */
export function findSolutions(grid: Grid, limit: number, fixed: Pandas = []): SolutionSearch {
  const { size, regions } = grid;
  const search: SolutionSearch = { solutions: [], nodes: 0 };
  if (conflicts(grid, fixed).size > 0) return search;
  const fixedByRow = new Map(fixed.map((cell) => [rowOf(cell, size), colOf(cell, size)]));
  const cols = new Set(fixed.map((cell) => colOf(cell, size)));
  const used = new Set(fixed.map((cell) => regions[cell]));
  const path: number[] = [];

  const place = (row: number, previous: number): void => {
    if (row === size) {
      search.solutions.push([...path]);
      return;
    }
    const forced = fixedByRow.get(row);
    for (let col = 0; col < size && search.solutions.length < limit; col++) {
      if (forced !== undefined && col !== forced) continue;
      const cell = row * size + col;
      if (forced === undefined && (cols.has(col) || used.has(regions[cell]))) continue;
      if (previous !== -1 && Math.abs(col - previous) <= 1) continue;
      search.nodes++;
      path.push(cell);
      if (forced === undefined) {
        cols.add(col);
        used.add(regions[cell]);
      }
      place(row + 1, col);
      if (forced === undefined) {
        cols.delete(col);
        used.delete(regions[cell]);
      }
      path.pop();
    }
  };

  place(0, -1);
  return search;
}

/* ---------- État diffusé en direct ---------- */

/** Ce que voient les autres joueurs d'une partie : la grille, les bosquets où un panda est trouvé, les erreurs. */
export interface LiveView {
  grid: Grid;
  /** Bosquets dont le panda est trouvé ; sa case n'est pas diffusée, pour ne rien révéler de la solution. */
  found: ReadonlySet<number>;
  misses: number;
}

/**
 * État d'une partie pour les autres joueurs : la grille, chaque case d'un bosquet trouvé en majuscule, puis `!`
 * et le nombre d'erreurs. Ex. "AAaaa.aabbb!1". La case de chaque panda n'y figure pas.
 */
export function liveState(grid: Grid, pandas: Pandas, misses: number): string {
  const found = new Set(pandas.map((cell) => grid.regions[cell]));
  const text = gridToString(grid).split('');
  let cell = 0;
  const cells = text.map((char) => {
    if (char === '.') return char;
    const shown = found.has(grid.regions[cell]) ? char.toUpperCase() : char;
    cell++;
    return shown;
  });
  return `${cells.join('')}!${misses}`;
}

/** Vue d'un état diffusé par `liveState`, ou `null` s'il est illisible ou si un bosquet est à moitié trouvé. */
export function parseLiveState(state: string): LiveView | null {
  const match = /^([^!]+)!(\d)$/.exec(state);
  const text = match?.[1] ?? '';
  const grid = parseGrid(text.toLowerCase());
  if (!match || !grid) return null;
  const found = new Set<number>();
  const hidden = new Set<number>();
  [...text.split('.').join('')].forEach((char, cell) => {
    const region = grid.regions[cell] ?? -1;
    (char === char.toLowerCase() ? hidden : found).add(region);
  });
  if ([...found].some((region) => hidden.has(region))) return null;
  return { grid, found, misses: Number(match[2]) };
}
