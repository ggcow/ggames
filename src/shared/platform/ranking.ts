// Classements : à égalité, même rang, et le rang suivant vient juste après (« 1, 1, 2 ») : trois premiers ex
// æquo n'effacent pas les deuxième et troisième places du podium.

import { isAtLeastAsGood, type ScoreOrder } from '../games/game.ts';
import type { PlayerId, RecordEntry } from './protocol.ts';

/** Rang de chaque élément d'une liste déjà triée ; `tied` dit si deux voisins sont à égalité. */
export function denseRanks<T>(sorted: readonly T[], tied: (a: T, b: T) => boolean): number[] {
  const ranks: number[] = [];
  sorted.forEach((item, index) => {
    const previous = sorted[index - 1];
    const previousRank = ranks[index - 1] ?? 0;
    ranks.push(previous !== undefined && tied(previous, item) ? previousRank : previousRank + 1);
  });
  return ranks;
}

/**
 * Place d'un score face aux meilleurs scores des autres joueurs : record à lui seul, record partagé avec les
 * ex æquo, ou en dessous du record.
 */
export type RecordStanding = { kind: 'record' } | { kind: 'shared'; with: readonly PlayerId[] } | { kind: 'below' };

/** `others` : meilleurs scores des autres joueurs sur la clé, du meilleur au moins bon. */
export function recordStanding(
  value: number,
  others: readonly Pick<RecordEntry, 'player' | 'value'>[],
  order: ScoreOrder,
): RecordStanding {
  const top = others[0];
  if (!top) return { kind: 'record' };
  if (value === top.value) {
    return { kind: 'shared', with: others.filter((entry) => entry.value === top.value).map((entry) => entry.player) };
  }
  return isAtLeastAsGood(value, top.value, order) ? { kind: 'record' } : { kind: 'below' };
}
