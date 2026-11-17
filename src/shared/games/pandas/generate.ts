// Générateur des niveaux de Pandas : des grilles de plus en plus grandes, chacune avec une seule solution.
// Sert une fois pour toutes à écrire `levels.ts` (`npm run levels -- pandas`), jamais pendant une partie.

import { createRandom, shuffle } from '../random.ts';
import {
  findSolutions,
  type Grid,
  gridToString,
  isRegionConnected,
  MAX_SIZE,
  MIN_SIZE,
  sideNeighbors,
} from './rules.ts';

/** Premier niveau de chaque taille de grille, de `MIN_SIZE` à `MAX_SIZE`. */
const SIZE_STARTS = [1, 11, 26, 46, 66, 86] as const;

/** Grilles candidates par niveau : la plus difficile est retenue vers la fin de chaque palier de taille. */
const CANDIDATES = 5;

/** Retouches au plus d'une grille pour qu'elle n'ait qu'une solution, avant d'en recommencer une autre. */
const MAX_TWEAKS = 400;

/** Côté de la grille du niveau `level`. */
export function sizeOfLevel(level: number): number {
  const step = SIZE_STARTS.filter((start) => level >= start).length - 1;
  return Math.min(MAX_SIZE, MIN_SIZE + Math.max(0, step));
}

/** Position du niveau dans son palier de taille : 0 au premier niveau du palier, 1 au dernier. */
function stepProgress(level: number): number {
  const size = sizeOfLevel(level);
  const start = SIZE_STARTS[size - MIN_SIZE] ?? 1;
  const end = (SIZE_STARTS[size - MIN_SIZE + 1] ?? 101) - 1;
  return end === start ? 1 : (level - start) / (end - start);
}

/** Une colonne par ligne, deux lignes voisines jamais dans des colonnes voisines : une solution possible. */
function randomPlacement(size: number, random: () => number): number[] | null {
  const cols: number[] = [];
  const place = (row: number): boolean => {
    if (row === size) return true;
    for (const col of shuffle(
      Array.from({ length: size }, (_, i) => i),
      random,
    )) {
      const previous = cols[row - 1];
      if (cols.includes(col) || (previous !== undefined && Math.abs(col - previous) <= 1)) continue;
      cols.push(col);
      if (place(row + 1)) return true;
      cols.pop();
    }
    return false;
  };
  return place(0) ? cols.map((col, row) => row * size + col) : null;
}

/** Bosquets qui poussent au hasard autour de chaque panda de la solution, jusqu'à couvrir la grille. */
function growRegions(size: number, seeds: readonly number[], random: () => number): number[] {
  const regions = Array.from({ length: size * size }, () => -1);
  seeds.forEach((cell, region) => {
    regions[cell] = region;
  });
  for (let left = size * size - seeds.length; left > 0; left--) {
    const frontier: [number, number][] = [];
    regions.forEach((region, cell) => {
      if (region === -1) return;
      for (const next of sideNeighbors(cell, size)) if (regions[next] === -1) frontier.push([next, region]);
    });
    const [cell, region] = frontier[Math.floor(random() * frontier.length)] ?? [0, 0];
    regions[cell] = region;
  }
  return regions;
}

/**
 * Retouche les bosquets jusqu'à ce que la solution `seeds` soit la seule : une case d'une autre solution passe
 * dans le bosquet d'une voisine, ce qui met deux pandas de cette solution dans le même bosquet.
 */
function makeUnique(size: number, seeds: readonly number[], random: () => number): Grid | null {
  const regions = growRegions(size, seeds, random);
  const seedSet = new Set(seeds);
  for (let tweak = 0; tweak < MAX_TWEAKS; tweak++) {
    const grid = { size, regions: [...regions] };
    const other = findSolutions(grid, 2).solutions.find((solution) => solution.some((cell) => !seedSet.has(cell)));
    if (!other) return grid;
    const moves = shuffle(
      other.filter((cell) => !seedSet.has(cell)),
      random,
    ).flatMap((cell) =>
      sideNeighbors(cell, size)
        .filter((next) => regions[next] !== regions[cell])
        .map((next) => [cell, regions[next] ?? 0] as const),
    );
    const move = moves.find(([cell, target]) => {
      const source = regions[cell] ?? 0;
      regions[cell] = target;
      const connected = isRegionConnected(regions, size, source);
      regions[cell] = source;
      return connected;
    });
    if (!move) return null;
    regions[move[0]] = move[1];
  }
  return null;
}

/** Grille à solution unique du niveau `level`, reproductible : même graine, même grille. */
export function generateLevel(level: number): Grid {
  const size = sizeOfLevel(level);
  const random = createRandom(level * 7919 + 17);
  const candidates: { grid: Grid; effort: number }[] = [];
  while (candidates.length < CANDIDATES) {
    const seeds = randomPlacement(size, random);
    const grid = seeds ? makeUnique(size, seeds, random) : null;
    if (grid) candidates.push({ grid, effort: findSolutions(grid, 2).nodes });
  }
  // Les cases essayées par la recherche mesurent la difficulté : le palier commence facile et finit difficile.
  candidates.sort((a, b) => a.effort - b.effort);
  const chosen = candidates[Math.round(stepProgress(level) * (CANDIDATES - 1))] ?? candidates[0];
  if (!chosen) throw new Error(`niveau ${level} : aucune grille`);
  return chosen.grid;
}

/** Les niveaux 1 à `count`, encodés comme `parseGrid` les relit. */
export function generateLevels(count: number, progress: (level: number) => void): string[] {
  return Array.from({ length: count }, (_, index) => {
    const text = gridToString(generateLevel(index + 1));
    progress(index + 1);
    return text;
  });
}
