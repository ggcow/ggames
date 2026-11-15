// Définition du jeu Bouquets pour la plateforme : niveaux enregistrés de la campagne, replays.

import { campaignCompareKeys, campaignIsUnlocked, parseCampaignKey } from '../campaign.ts';
import type { GameDefinition, ReplayOutcome } from '../game.ts';
import { countMoves } from '../moves.ts';
import { LEVELS } from './levels.ts';
import { applyMove, type Board, cloneBoard, isSolved, type Move, parseBoard } from './rules.ts';

export const BOUQUETS_ID = 'bouquets';

/* ---------- Campagne ---------- */

/** Plateau enregistré du niveau `level` (copie modifiable), ou `null` s'il n'existe pas. */
export function levelBoard(level: number): Board | null {
  const text = LEVELS[level - 1];
  return text === undefined ? null : parseBoard(text);
}

/** Plateau de départ d'une clé, ou `null` si la clé est invalide. */
export function startBoard(key: string): Board | null {
  const level = parseCampaignKey(key);
  return level === null ? null : levelBoard(level);
}

/* ---------- Replays ---------- */

/** Une action : déplacer une fleur, ou annuler le dernier déplacement. Annuler compte comme un coup. */
export type BouquetsAction = ({ type: 'move' } & Move) | { type: 'undo' };

/**
 * Encodage : `u` pour annuler ; pour un déplacement, quatre chiffres hexadécimaux (pot et place de départ, pot et
 * place d'arrivée). Ex. "0120u".
 */
export const encodeActions = (actions: readonly BouquetsAction[]): string =>
  actions
    .map((a) => (a.type === 'undo' ? 'u' : [a.from, a.slot, a.to, a.place].map((n) => n.toString(16)).join('')))
    .join('');

export function decodeActions(replay: string): BouquetsAction[] | null {
  const actions: BouquetsAction[] = [];
  for (let i = 0; i < replay.length; ) {
    if (replay[i] === 'u') {
      actions.push({ type: 'undo' });
      i += 1;
      continue;
    }
    const group = replay.slice(i, i + 4);
    if (!/^[0-9a-f]{4}$/.test(group)) return null;
    const [from, slot, to, place] = [...group].map((digit) => Number.parseInt(digit, 16));
    if (from === undefined || slot === undefined || to === undefined || place === undefined) return null;
    actions.push({ type: 'move', from, slot, to, place });
    i += 4;
  }
  return actions;
}

/**
 * Applique les actions au plateau de départ. Renvoie chaque état intermédiaire (index 0 = départ),
 * ou `null` si une action est impossible.
 */
export function playActions(start: Board, actions: readonly BouquetsAction[]): Board[] | null {
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
      if (!applyMove(board, action)) return null;
      history.push(before);
    }
    states.push(cloneBoard(board));
  }
  return states;
}

/* ---------- Définition ---------- */

export const bouquets: GameDefinition = {
  id: BOUQUETS_ID,
  scoreOrder: 'asc',
  isValidKey: (key) => parseCampaignKey(key) !== null,
  compareKeys: campaignCompareKeys,
  isUnlocked: campaignIsUnlocked,
  replay(key, replay): ReplayOutcome | null {
    const start = startBoard(key);
    const actions = decodeActions(replay);
    if (!start || !actions) return null;
    const states = playActions(start, actions);
    if (!states) return null;
    const firstSolved = states.findIndex(isSolved);
    // Une partie s'arrête dès que le plateau est vide : aucune action après.
    if (firstSolved !== -1 && firstSolved !== states.length - 1) return null;
    return { finished: firstSolved !== -1, value: countMoves(actions) };
  },
};
