// Aides de test pour Couteaux : niveau enregistré, partie gagnée sans rebond, partie perdue sur trois rebonds.

import { levelOf } from '../../src/shared/games/couteaux/definition.ts';
import { perfectThrows } from '../../src/shared/games/couteaux/generate.ts';
import {
  FLIGHT_TICKS,
  hits,
  impactAt,
  type Level,
  LIVES,
  rotationOf,
  THROW_TICKS,
} from '../../src/shared/games/couteaux/rules.ts';

/** Niveau enregistré de la campagne, qui doit exister. */
export function couteauxLevel(level: number): Level {
  const found = levelOf(level);
  if (!found) throw new Error(`niveau ${level} absent`);
  return found;
}

/** Pas des lancers d'une partie gagnée sans rebond. */
export function couteauxWin(level: number): number[] {
  const ticks = perfectThrows(couteauxLevel(level));
  if (!ticks) throw new Error(`niveau ${level} sans partie parfaite`);
  return ticks;
}

/** Premier pas, à partir de `from`, où un couteau lancé rebondit sur `planted` ou un obstacle. */
export function bouncingTick(level: Level, planted: readonly number[], from: number): number {
  const rotation = rotationOf(level);
  for (let tick = from; tick < from + 100_000; tick++) {
    if (hits(level, planted, impactAt(rotation, tick + FLIGHT_TICKS))) return tick;
  }
  throw new Error('aucun rebond possible');
}

/** Une partie perdue : un couteau planté sans rebond, puis LIVES lancers qui rebondissent dessus. */
export function couteauxLoss(level: number): number[] {
  const found = couteauxLevel(level);
  const [first = 0] = couteauxWin(level);
  const planted = [impactAt(rotationOf(found), first + FLIGHT_TICKS)];
  const ticks = [first];
  for (let miss = 0; miss < LIVES; miss++) {
    ticks.push(bouncingTick(found, planted, (ticks[ticks.length - 1] ?? 0) + THROW_TICKS));
  }
  return ticks;
}

/** Une victoire avec un rebond : un couteau planté, un lancer qui rebondit dessus, puis les autres plantés. */
export function couteauxWinWithMiss(level: number): number[] {
  const found = couteauxLevel(level);
  const rotation = rotationOf(found);
  const [first = 0] = couteauxWin(level);
  const planted = [impactAt(rotation, first + FLIGHT_TICKS)];
  const ticks = [first, bouncingTick(found, planted, first + THROW_TICKS)];
  for (let tick = (ticks[1] ?? 0) + THROW_TICKS; planted.length < found.knives; tick++) {
    const angle = impactAt(rotation, tick + FLIGHT_TICKS);
    if (hits(found, planted, angle)) continue;
    planted.push(angle);
    ticks.push(tick);
    tick += THROW_TICKS - 1;
  }
  return ticks;
}
