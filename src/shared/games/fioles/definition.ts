// Définition du jeu Fioles pour la plateforme : clés, campagne, replays, validation des niveaux créés.

import type { GameDefinition, KeyTarget, ReplayOutcome } from '../game.ts';
import { type Board, cloneBoard, generateBoard, isSolved, MAX_COLORS, parseBoard, pour } from './rules.ts';

export const FIOLES_ID = 'fioles';

/* ---------- Campagne ---------- */

/** +1 couleur tous les 3 niveaux, plafonné à MAX_COLORS. Toujours 2 fioles vides. */
export const campaignColors = (level: number): number => Math.min(3 + Math.floor((level - 1) / 3), MAX_COLORS);

const campaignCache = new Map<number, Board>();

/**
 * Plateau du niveau `level` de la campagne, identique sur tous les appareils.
 * Toute modification de la génération change les niveaux et invalide les parties enregistrées.
 */
export function campaignBoard(level: number): Board {
  let board = campaignCache.get(level);
  if (!board) {
    board = generateBoard(campaignColors(level), 2, level);
    campaignCache.set(level, board);
  }
  return cloneBoard(board);
}

/* ---------- Clés ---------- */

/** `c:<niveau>` pour la campagne, `l:<id>` pour un niveau créé par un joueur. */
export type FiolesTarget = { kind: 'campaign'; level: number } | { kind: 'custom'; contentId: string };

export const campaignKey = (level: number): string => `c:${level}`;
export const customKey = (contentId: string): string => `l:${contentId}`;

export function parseFiolesKey(key: string): FiolesTarget | null {
  const campaign = /^c:([1-9]\d{0,3})$/.exec(key);
  if (campaign?.[1]) return { kind: 'campaign', level: Number(campaign[1]) };
  const custom = /^l:([a-z0-9]{6,20})$/.exec(key);
  if (custom?.[1]) return { kind: 'custom', contentId: custom[1] };
  return null;
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

/** Plateau de départ d'une clé : généré pour la campagne, lu dans le contenu pour un niveau créé. */
export function startBoard(key: string, content: string | null): Board | null {
  const target = parseFiolesKey(key);
  if (!target) return null;
  if (target.kind === 'campaign') return campaignBoard(target.level);
  return content === null ? null : parseBoard(content);
}

/* ---------- Définition ---------- */

export const fioles: GameDefinition = {
  id: FIOLES_ID,
  scoreOrder: 'asc',
  parseKey(key): KeyTarget | null {
    const target = parseFiolesKey(key);
    if (!target) return null;
    return target.kind === 'campaign' ? { kind: 'builtin' } : { kind: 'content', contentId: target.contentId };
  },
  contentKey: customKey,
  isValidContent(data) {
    const board = parseBoard(data);
    return board !== null && !isSolved(board);
  },
  replay(key, content, replay): ReplayOutcome | null {
    const start = startBoard(key, content);
    const actions = decodeActions(replay);
    if (!start || !actions) return null;
    const states = playActions(start, actions);
    if (!states) return null;
    const firstSolved = states.findIndex(isSolved);
    // Une partie s'arrête dès que le plateau est résolu : aucune action après.
    if (firstSolved !== -1 && firstSolved !== states.length - 1) return null;
    return { finished: firstSolved !== -1, value: actions.length };
  },
};
