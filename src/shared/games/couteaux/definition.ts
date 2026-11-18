// Définition du jeu Couteaux pour la plateforme : niveaux enregistrés de la campagne (LEVEL_COUNT), replays.

import { campaignCompareKeys, campaignIsUnlocked, parseCampaignKey } from '../campaign.ts';
import type { GameDefinition, ReplayOutcome } from '../game.ts';
import { LEVELS } from './levels.ts';
import { isWon, LEVEL_COUNT, type Level, parseLevel, rotationOf, START, type Throws, throwKnife } from './rules.ts';

export const COUTEAUX_ID = 'couteaux';

/** Niveau enregistré numéro `level`, ou `null` s'il n'existe pas. */
export function levelOf(level: number): Level | null {
  const text = LEVELS[level - 1];
  return text === undefined ? null : parseLevel(text);
}

/** Niveau d'une clé, ou `null` si la clé est invalide. */
export function startLevel(key: string): Level | null {
  const level = parseCampaignKey(key, LEVEL_COUNT);
  return level === null ? null : levelOf(level);
}

/* ---------- Replays ---------- */

/**
 * Un replay est la suite des pas des lancers, chacun compté depuis le précédent (le premier depuis le départ),
 * en base 36 et séparés par un point. Ex. "1k.b.2f". Quatre chiffres au plus par écart : plus de sept heures.
 */
export const encodeThrows = (ticks: readonly number[]): string =>
  ticks.map((tick, index) => (tick - (index === 0 ? 0 : (ticks[index - 1] ?? 0))).toString(36)).join('.');

export function decodeThrows(replay: string): number[] | null {
  if (replay === '') return [];
  if (!/^[0-9a-z]{1,4}(\.[0-9a-z]{1,4})*$/.test(replay)) return null;
  let tick = 0;
  return replay.split('.').map((delay) => {
    tick += Number.parseInt(delay, 36);
    return tick;
  });
}

/** États successifs d'une partie (index 0 = départ), ou `null` si un lancer est impossible. */
export function playThrows(level: Level, ticks: readonly number[]): Throws[] | null {
  const rotation = rotationOf(level);
  const states: Throws[] = [START];
  for (const tick of ticks) {
    const next = throwKnife(level, rotation, states[states.length - 1] ?? START, tick);
    if (!next) return null;
    states.push(next.throws);
  }
  return states;
}

/* ---------- Définition ---------- */

export const couteaux: GameDefinition = {
  id: COUTEAUX_ID,
  // Le score est le nombre de rebonds : moins il y en a, mieux c'est.
  scoreOrder: 'asc',
  isValidKey: (key) => parseCampaignKey(key, LEVEL_COUNT) !== null,
  compareKeys: campaignCompareKeys,
  isUnlocked: (key, won) => campaignIsUnlocked(key, won, LEVEL_COUNT),
  replay(key, replay): ReplayOutcome | null {
    const level = startLevel(key);
    const ticks = decodeThrows(replay);
    const states = level && ticks ? playThrows(level, ticks) : null;
    const last = states?.[states.length - 1];
    if (!level || !last) return null;
    return { finished: isWon(level, last), value: last.misses };
  },
  // Chaque niveau enregistré se gagne sans rebond : le générateur l'a vérifié en le jouant.
  bestPossible: (key) => (startLevel(key) ? 0 : null),
};
