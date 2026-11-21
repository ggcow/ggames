// Définition du jeu Fioles pour la plateforme : niveaux enregistrés de la campagne, replays.

import { campaignCompareKeys, campaignIsUnlocked, parseCampaignKey } from '../campaign.ts';
import type { GameDefinition, ReplayOutcome } from '../game.ts';
import { countMoves } from '../moves.ts';
import { LEVELS } from './levels.ts';
import { OPTIMAL } from './optimal.ts';
import { type Board, cloneBoard, isSolved, parseBoard, pour } from './rules.ts';

export const FIOLES_ID = 'fioles';

/* ---------- Campagne ---------- */

/** Plateau enregistré du niveau `level` (copie modifiable), ou `null` s'il n'existe pas. */
export function levelBoard(level: number): Board | null {
  const text = LEVELS[level - 1];
  return text === undefined ? null : parseBoard(text);
}

/* ---------- Replays ---------- */

/**
 * Une action : verser (`from`, `to`) ou annuler le dernier versement.
 * Annuler compte comme un coup : le score est le nombre total d'actions.
 */
export type FiolesAction = { type: 'pour'; from: number; to: number } | { type: 'undo' };

/** Encodage : `u` pour annuler, deux chiffres hexadécimaux (source, cible) pour verser. Ex. "03u21". */
export const encodeActions = (actions: readonly FiolesAction[]): string =>
  actions.map((a) => (a.type === 'undo' ? 'u' : a.from.toString(16) + a.to.toString(16))).join('');

export function decodeActions(replay: string): FiolesAction[] | null {
  const actions: FiolesAction[] = [];
  for (let i = 0; i < replay.length; ) {
    if (replay[i] === 'u') {
      actions.push({ type: 'undo' });
      i += 1;
      continue;
    }
    const pair = replay.slice(i, i + 2);
    if (!/^[0-9a-f]{2}$/.test(pair)) return null;
    actions.push({ type: 'pour', from: Number.parseInt(pair[0] ?? '', 16), to: Number.parseInt(pair[1] ?? '', 16) });
    i += 2;
  }
  return actions;
}

/**
 * Applique les actions au plateau de départ. Renvoie chaque état intermédiaire (index 0 = départ),
 * ou `null` si une action est impossible.
 */
export function playActions(start: Board, actions: readonly FiolesAction[]): Board[] | null {
  const states: Board[] = [cloneBoard(start)];
  const history: Board[] = [];
  let board = cloneBoard(start);
  for (const action of actions) {
    if (action.type === 'undo') {
      const previous = history.pop();
      if (!previous) return null;
      board = previous;
    } else {
      const before = cloneBoard(board);
      if (pour(board, action.from, action.to) === 0) return null;
      history.push(before);
    }
    states.push(cloneBoard(board));
  }
  return states;
}

/** Plateau de départ d'une clé, ou `null` si la clé est invalide. */
export function startBoard(key: string): Board | null {
  const level = parseCampaignKey(key);
  return level === null ? null : levelBoard(level);
}

/* ---------- Définition ---------- */

export const fioles: GameDefinition = {
  id: FIOLES_ID,
  scoreOrder: 'asc',
  isValidKey: (key) => parseCampaignKey(key) !== null,
  compareKeys: campaignCompareKeys,
  isUnlocked: campaignIsUnlocked,
  lossCooldownMs: 0,
  replay(key, replay): ReplayOutcome | null {
    const start = startBoard(key);
    const actions = decodeActions(replay);
    if (!start || !actions) return null;
    const states = playActions(start, actions);
    if (!states) return null;
    const firstSolved = states.findIndex(isSolved);
    // Une partie s'arrête dès que le plateau est résolu : aucune action après.
    if (firstSolved !== -1 && firstSolved !== states.length - 1) return null;
    return { finished: firstSolved !== -1, value: countMoves(actions) };
  },
  bestPossible(key) {
    const level = parseCampaignKey(key);
    return level === null ? null : (OPTIMAL[level - 1] ?? null);
  },
};
