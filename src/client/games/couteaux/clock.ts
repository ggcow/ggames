// Horloge des écrans animés de Couteaux : l'heure et les images du navigateur, remplaçables dans les tests.

import { type Rotation, TICK_MS, turnedAt } from '../../../shared/games/couteaux/rules.ts';

export interface Clock {
  /** Heure en millisecondes, croissante. */
  now(): number;
  /** Demande `callback` à la prochaine image. */
  frame(callback: () => void): number;
  cancel(id: number): void;
}

export const browserClock: Clock = {
  now: () => performance.now(),
  frame: (callback) => requestAnimationFrame(callback),
  cancel: (id) => cancelAnimationFrame(id),
};

/** Pas écoulés (avec leur fraction) entre `since` et `now`. */
export const ticksBetween = (since: number, now: number): number => Math.max(0, (now - since) / TICK_MS);

/** Rotation de la planète à un instant entre deux pas : une image tombe rarement juste sur un pas. */
export function smoothTurn(rotation: Rotation, ticks: number): number {
  const tick = Math.floor(ticks);
  const from = turnedAt(rotation, tick);
  return from + (turnedAt(rotation, tick + 1) - from) * (ticks - tick);
}
