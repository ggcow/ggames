// Définition du jeu Parking pour la plateforme : parkings enregistrés de la campagne, replays.

import { campaignCompareKeys, campaignIsUnlocked, parseCampaignKey } from '../campaign.ts';
import type { GameDefinition, ReplayOutcome } from '../game.ts';
import { countMoves } from '../moves.ts';
import { LEVELS } from './levels.ts';
import { OPTIMAL } from './optimal.ts';
import { type Board, CAR, isSolved, LETTERS, parseBoard, SIZE, type Slide, slide } from './rules.ts';

export const PARKING_ID = 'parking';

/* ---------- Campagne ---------- */

/** Parking enregistré du niveau `level`, ou `null` s'il n'existe pas. */
export function levelBoard(level: number): Board | null {
  const text = LEVELS[level - 1];
  return text === undefined ? null : parseBoard(text);
}

/** Parking de départ d'une clé, ou `null` si la clé est invalide. */
export function startBoard(key: string): Board | null {
  const level = parseCampaignKey(key);
  return level === null ? null : levelBoard(level);
}

/* ---------- Replays ---------- */

/** Une action : glisser un véhicule, ou annuler le dernier glissement qui reste. */
export type ParkingAction = ({ type: 'slide' } & Slide) | { type: 'undo' };

/**
 * Encodage : `u` pour annuler ; pour un glissement, la lettre du véhicule, le sens (`+` vers la droite ou le bas,
 * `-` de l'autre côté) et le nombre de cases. Ex. "b+2a-1u".
 */
export const encodeActions = (actions: readonly ParkingAction[]): string =>
  actions
    .map((action) =>
      action.type === 'undo'
        ? 'u'
        : `${LETTERS[action.vehicle] ?? '?'}${action.delta > 0 ? '+' : '-'}${Math.abs(action.delta)}`,
    )
    .join('');

/** Un glissement encodé : un véhicule glisse au plus de la longueur du parking moins celle d'une voiture. */
const SLIDE = new RegExp(`^([${LETTERS}])([+-])([1-${SIZE - CAR}])$`);

export function decodeActions(replay: string): ParkingAction[] | null {
  const actions: ParkingAction[] = [];
  for (let i = 0; i < replay.length; ) {
    if (replay[i] === 'u') {
      actions.push({ type: 'undo' });
      i += 1;
      continue;
    }
    const match = SLIDE.exec(replay.slice(i, i + 3));
    if (!match) return null;
    const [, letter = '', sign = '', distance = ''] = match;
    actions.push({ type: 'slide', vehicle: LETTERS.indexOf(letter), delta: Number(sign + distance) });
    i += 3;
  }
  return actions;
}

/**
 * Applique les actions au parking de départ. Renvoie chaque état intermédiaire (index 0 = départ),
 * ou `null` si une action est impossible.
 */
export function playActions(start: Board, actions: readonly ParkingAction[]): Board[] | null {
  const states: Board[] = [start];
  const history: Board[] = [];
  let board = start;
  for (const action of actions) {
    if (action.type === 'undo') {
      const previous = history.pop();
      if (!previous) return null;
      board = previous;
    } else {
      const after = slide(board, action);
      if (!after) return null;
      history.push(board);
      board = after;
    }
    states.push(board);
  }
  return states;
}

/* ---------- Définition ---------- */

export const parking: GameDefinition = {
  id: PARKING_ID,
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
    // Une partie s'arrête dès que la voiture rouge touche la sortie : aucune action après.
    if (firstSolved !== -1 && firstSolved !== states.length - 1) return null;
    return { finished: firstSolved !== -1, value: countMoves(actions) };
  },
  bestPossible(key) {
    const level = parseCampaignKey(key);
    return level === null ? null : (OPTIMAL[level - 1] ?? null);
  },
};
