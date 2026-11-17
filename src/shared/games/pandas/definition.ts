// Définition du jeu Pandas pour la plateforme : grilles enregistrées de la campagne, replays.

import { campaignCompareKeys, campaignIsUnlocked, parseCampaignKey } from '../campaign.ts';
import type { GameDefinition, ReplayOutcome } from '../game.ts';
import { LEVELS } from './levels.ts';
import { type Grid, isSolved, type Pandas, parseGrid, togglePanda } from './rules.ts';

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

/* ---------- Replays ---------- */

/**
 * Un replay est la suite des cases touchées : chacune pose un panda, ou le retire s'il y est déjà. Les croix de
 * repérage restent sur l'écran du joueur et n'entrent pas dans le replay.
 * Encodage : deux chiffres par case. Ex. "071233".
 */
export const encodeActions = (cells: readonly number[]): string =>
  cells.map((cell) => String(cell).padStart(2, '0')).join('');

export function decodeActions(replay: string): number[] | null {
  if (!/^(\d{2})*$/.test(replay)) return null;
  return Array.from({ length: replay.length / 2 }, (_, i) => Number(replay.slice(i * 2, i * 2 + 2)));
}

/**
 * Pose ou retire les pandas des cases touchées sur une grille vide. Renvoie les pandas après chaque case
 * (index 0 = départ), ou `null` si une case est hors de la grille.
 */
export function playActions(grid: Grid, cells: readonly number[]): Pandas[] | null {
  if (cells.some((cell) => cell >= grid.size * grid.size)) return null;
  const states: Pandas[] = [[]];
  for (const cell of cells) states.push(togglePanda(states[states.length - 1] ?? [], cell));
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
    if (!grid || !cells) return null;
    const states = playActions(grid, cells);
    if (!states) return null;
    const firstSolved = states.findIndex((state) => isSolved(grid, state));
    // Une partie s'arrête dès que la grille est résolue : aucune action après.
    if (firstSolved !== -1 && firstSolved !== states.length - 1) return null;
    return { finished: firstSolved !== -1, value: cells.length };
  },
  // Pas de score : avec les croix, tout joueur finit au minimum de cases touchées ; seule la réussite compte.
  bestPossible: () => null,
};
