// Définition du jeu Pandas pour la plateforme : grilles enregistrées de la campagne, replays.

import { campaignCompareKeys, campaignIsUnlocked, parseCampaignKey } from '../campaign.ts';
import type { GameDefinition, ReplayOutcome } from '../game.ts';
import { countMoves } from '../moves.ts';
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
 * Une action : poser ou retirer le panda d'une case, ou annuler la dernière. Les croix de repérage ne sont pas des
 * coups : elles restent sur l'écran du joueur et n'entrent pas dans le replay.
 */
export type PandasAction = { type: 'toggle'; cell: number } | { type: 'undo' };

/** Encodage : `u` pour annuler, deux chiffres (numéro de case) pour poser ou retirer. Ex. "0712u33". */
export const encodeActions = (actions: readonly PandasAction[]): string =>
  actions.map((action) => (action.type === 'undo' ? 'u' : String(action.cell).padStart(2, '0'))).join('');

export function decodeActions(replay: string): PandasAction[] | null {
  const actions: PandasAction[] = [];
  for (let i = 0; i < replay.length; ) {
    if (replay[i] === 'u') {
      actions.push({ type: 'undo' });
      i += 1;
      continue;
    }
    const pair = replay.slice(i, i + 2);
    if (!/^\d{2}$/.test(pair)) return null;
    actions.push({ type: 'toggle', cell: Number(pair) });
    i += 2;
  }
  return actions;
}

/**
 * Applique les actions à une grille sans panda. Renvoie les pandas après chaque action (index 0 = départ), ou
 * `null` si une action est impossible (case hors de la grille, annulation sans coup à annuler).
 */
export function playActions(grid: Grid, actions: readonly PandasAction[]): Pandas[] | null {
  const states: Pandas[] = [[]];
  const history: Pandas[] = [];
  let pandas: Pandas = [];
  for (const action of actions) {
    if (action.type === 'undo') {
      const previous = history.pop();
      if (!previous) return null;
      pandas = previous;
    } else {
      if (action.cell >= grid.size * grid.size) return null;
      history.push(pandas);
      pandas = togglePanda(pandas, action.cell);
    }
    states.push(pandas);
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
    const actions = decodeActions(replay);
    if (!grid || !actions) return null;
    const states = playActions(grid, actions);
    if (!states) return null;
    const firstSolved = states.findIndex((state) => isSolved(grid, state));
    // Une partie s'arrête dès que la grille est résolue : aucune action après.
    if (firstSolved !== -1 && firstSolved !== states.length - 1) return null;
    return { finished: firstSolved !== -1, value: countMoves(actions) };
  },
  // Il faut poser un panda par ligne, et chaque pose est un coup : une grille de côté n se gagne au mieux en n
  // coups, sans essai ni retrait.
  bestPossible(key) {
    return startGrid(key)?.size ?? null;
  },
};
