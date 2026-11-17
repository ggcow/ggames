// Définition du jeu Pandas pour la plateforme : grilles enregistrées de la campagne, replays.

import { campaignCompareKeys, campaignIsUnlocked, parseCampaignKey } from '../campaign.ts';
import type { GameDefinition, ReplayOutcome } from '../game.ts';
import { LEVELS } from './levels.ts';
import { findSolutions, type Grid, isSolved, type Pandas, parseGrid } from './rules.ts';

export const PANDAS_ID = 'pandas';

/** Grille enregistrée du niveau `level`, ou `null` s'il n'existe pas. */
export function levelGrid(level: number): Grid | null {
  const text = LEVELS[level - 1];
  return text === undefined ? null : parseGrid(text);
}

/** Grille d'une clé, ou `null` si la clé est invalide. */
export function startGrid(key: string): Grid | null {
  const level = parseCampaignKey(key);
  return level === null ? null : levelGrid(level);
}

/* ---------- Tentatives ---------- */

/** Erreurs permises : à la troisième, la partie est perdue. */
export const LIVES = 3;

/**
 * Où en est une partie : les pandas bien posés et les cases tentées à tort. Une tentative sur une case de la
 * solution (unique) y pose un panda, une autre coûte une vie.
 */
export interface PandasState {
  pandas: Pandas;
  misses: readonly number[];
}

export const isLost = (state: PandasState): boolean => state.misses.length >= LIVES;

/** Pandas de la solution d'une grille ; chaque grille enregistrée en a exactement une. */
export const solutionOf = (grid: Grid): Pandas => findSolutions(grid, 1).solutions[0] ?? [];

/**
 * Tente de poser un panda sur `cell`. Renvoie l'état suivant, ou `null` si la tentative est impossible : case
 * hors de la grille ou déjà tentée, partie déjà gagnée ou perdue.
 */
export function attempt(grid: Grid, solution: Pandas, state: PandasState, cell: number): PandasState | null {
  const over = isSolved(grid, state.pandas) || isLost(state);
  const tried = state.pandas.includes(cell) || state.misses.includes(cell);
  if (over || tried || cell < 0 || cell >= grid.size * grid.size) return null;
  return solution.includes(cell)
    ? { pandas: [...state.pandas, cell].sort((a, b) => a - b), misses: state.misses }
    : { pandas: state.pandas, misses: [...state.misses, cell] };
}

/* ---------- Replays ---------- */

/**
 * Un replay est la suite des cases tentées. Les croix de repérage restent sur l'écran du joueur et n'entrent pas
 * dans le replay. Encodage : deux chiffres par case. Ex. "071233".
 */
export const encodeActions = (cells: readonly number[]): string =>
  cells.map((cell) => String(cell).padStart(2, '0')).join('');

export function decodeActions(replay: string): number[] | null {
  if (!/^(\d{2})*$/.test(replay)) return null;
  return Array.from({ length: replay.length / 2 }, (_, i) => Number(replay.slice(i * 2, i * 2 + 2)));
}

/** États successifs d'une partie (index 0 = départ), ou `null` si une tentative est impossible. */
export function playActions(grid: Grid, cells: readonly number[]): PandasState[] | null {
  const solution = solutionOf(grid);
  const states: PandasState[] = [{ pandas: [], misses: [] }];
  for (const cell of cells) {
    const next = attempt(grid, solution, states[states.length - 1] ?? { pandas: [], misses: [] }, cell);
    if (!next) return null;
    states.push(next);
  }
  return states;
}

/* ---------- Définition ---------- */

export const pandas: GameDefinition = {
  id: PANDAS_ID,
  scoreOrder: 'asc',
  isValidKey: (key) => parseCampaignKey(key) !== null,
  compareKeys: campaignCompareKeys,
  isUnlocked: campaignIsUnlocked,
  replay(key, replay): ReplayOutcome | null {
    const grid = startGrid(key);
    const cells = decodeActions(replay);
    const states = grid && cells ? playActions(grid, cells) : null;
    const last = states?.[states.length - 1];
    if (!grid || !last) return null;
    return { finished: isSolved(grid, last.pandas), value: last.misses.length };
  },
  // Pas de score : seule la réussite compte. Le nombre d'erreurs est gardé avec la partie, sans être affiché.
  bestPossible: () => null,
};
