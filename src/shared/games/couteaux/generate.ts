// Génération des niveaux de Couteaux : tirage des obstacles et de la rotation, vérification qu'une partie sans
// rebond existe, difficulté de la campagne. Utilisé uniquement par `npm run levels` (qui écrit levels.ts) et par
// les tests : les joueurs et le serveur lisent les niveaux enregistrés, jamais générés à la volée.

import { MAX_LEVEL } from '../campaign.ts';
import { createRandom } from '../random.ts';
import {
  distance,
  FLIGHT_TICKS,
  GAP,
  hits,
  impactAt,
  type Level,
  levelToString,
  MAX_SPEED,
  type Rotation,
  rotationOf,
  type Spin,
  TICKS_PER_SECOND,
  TURN,
} from './rules.ts';

/* ---------- Partie sans rebond ---------- */

/**
 * Pas consécutifs au moins où un lancer se plante sans rien toucher : une fenêtre plus courte demanderait une
 * précision qu'aucun doigt n'a.
 */
export const MIN_WINDOW = 5;

/** Attente au plus avant une fenêtre de tir : au-delà, le niveau serait plus lassant que difficile. */
export const MAX_WAIT = 8 * TICKS_PER_SECOND;

/** Vrai si un couteau lancé au pas `tick` se plante sans toucher `planted` ni les obstacles. */
const plants = (level: Level, rotation: Rotation, planted: readonly number[], tick: number): boolean =>
  !hits(level, planted, impactAt(rotation, tick + FLIGHT_TICKS));

/**
 * Une partie gagnée sans rebond : chaque couteau est lancé au milieu de la première fenêtre de MIN_WINDOW pas où
 * il se plante, MAX_WAIT pas au plus après que le précédent est arrivé. Renvoie les pas des lancers, ou `null`
 * si un couteau ne trouve pas de fenêtre.
 */
export function perfectThrows(level: Level): number[] | null {
  const rotation = rotationOf(level);
  const planted: number[] = [];
  const ticks: number[] = [];
  let ready = 0;
  while (planted.length < level.knives) {
    let run = 0;
    let found: number | null = null;
    for (let tick = ready; tick <= ready + MAX_WAIT && found === null; tick++) {
      run = plants(level, rotation, planted, tick) ? run + 1 : 0;
      if (run === MIN_WINDOW) found = tick - Math.floor(MIN_WINDOW / 2);
    }
    if (found === null) return null;
    ticks.push(found);
    planted.push(impactAt(rotation, found + FLIGHT_TICKS));
    ready = found + FLIGHT_TICKS;
  }
  return ticks;
}

/* ---------- Tirage ---------- */

/** Paramètres d'un niveau généré. */
export interface LevelSpec {
  /** Couteaux à planter. */
  knives: number;
  /** Couteaux déjà plantés au départ. */
  obstacles: number;
  /** Vitesse de rotation typique, en dixièmes de degré par pas. */
  speed: number;
  /** Vitesses successives entre lesquelles la planète accélère ou ralentit ; 1 : vitesse constante. */
  paces: number;
  /** La planète peut changer de sens. */
  reverse: boolean;
}

/** Écart minimal entre deux obstacles : collés, ils ne formeraient qu'un seul obstacle plus large. */
const OBSTACLE_GAP = 2 * GAP;

/** Durée d'une vitesse tenue, et d'une accélération d'une vitesse à la suivante, en pas. */
const HOLD_TICKS = [45, 150] as const;
const RAMP_TICKS = [12, 40] as const;

const between = (random: () => number, [low, high]: readonly [number, number]): number =>
  low + Math.floor(random() * (high - low + 1));

/** Obstacles tirés au hasard, assez espacés les uns des autres. */
function randomObstacles(count: number, random: () => number): number[] {
  const obstacles: number[] = [];
  for (let attempt = 0; attempt < 200 && obstacles.length < count; attempt++) {
    const angle = Math.floor(random() * TURN);
    if (obstacles.every((other) => distance(other, angle) >= OBSTACLE_GAP)) obstacles.push(angle);
  }
  return obstacles.sort((a, b) => a - b);
}

/**
 * Rotation tirée au hasard : `paces` vitesses autour de `speed`, chacune tenue un moment puis rejointe la
 * suivante en accélérant ; changement de sens possible si `reverse`. Le cycle reboucle sur la première vitesse.
 */
function randomSpin(spec: LevelSpec, random: () => number): Spin[] {
  const direction = random() < 0.5 ? -1 : 1;
  const paces = Array.from({ length: spec.paces }, (_, index) => {
    const size = Math.round(spec.speed * (0.6 + random() * 0.7));
    const sign = spec.reverse && index > 0 && random() < 0.5 ? -direction : direction;
    return Math.max(-MAX_SPEED, Math.min(MAX_SPEED, sign * Math.max(4, size)));
  });
  if (paces.length === 1) {
    const [only = spec.speed] = paces;
    return [{ ticks: between(random, HOLD_TICKS), from: only, to: only }];
  }
  return paces.flatMap((pace, index) => {
    const next = paces[(index + 1) % paces.length] ?? pace;
    return [
      { ticks: between(random, HOLD_TICKS), from: pace, to: pace },
      { ticks: between(random, RAMP_TICKS), from: pace, to: next },
    ];
  });
}

/** Niveau tiré au hasard selon `spec`. */
export const randomLevel = (spec: LevelSpec, random: () => number): Level => ({
  knives: spec.knives,
  obstacles: randomObstacles(spec.obstacles, random),
  spin: randomSpin(spec, random),
});

/** Tirages au plus pour un niveau, avant d'abandonner la génération. */
export const MAX_DRAWS = 500;

/**
 * Niveau tiré selon `spec` qui se gagne sans rebond (`perfectThrows`). `avoid` écarte des niveaux déjà retenus.
 * Même résultat pour une même graine ; échoue après `draws` tirages sans succès.
 */
export function generateLevelFor(
  spec: LevelSpec,
  seed: number,
  avoid: ReadonlySet<string> = new Set(),
  draws = MAX_DRAWS,
): Level {
  const random = createRandom(seed);
  for (let draw = 0; draw < draws; draw++) {
    const level = randomLevel(spec, random);
    if (!avoid.has(levelToString(level)) && perfectThrows(level)) return level;
  }
  throw new Error(`aucun niveau de ${spec.knives} couteaux après ${draws} tirages`);
}

/* ---------- Campagne ---------- */

/**
 * Difficulté du niveau `level` : plus de couteaux à planter (6 à 14) et d'obstacles (0 à 7), une planète plus
 * rapide, puis qui change de vitesse (dès le niveau 11) et de sens (dès le niveau 31).
 */
export function campaignSpec(level: number): LevelSpec {
  const progress = (level - 1) / (MAX_LEVEL - 1);
  return {
    knives: 6 + Math.floor((level - 1) / 12),
    obstacles: Math.floor((level - 1) / 14),
    speed: 15 + Math.floor(progress * 25),
    paces: level <= 10 ? 1 : level <= 30 ? 2 : level <= 60 ? 3 : 4,
    reverse: level > 30,
  };
}

/** Niveau enregistré numéro `level`, à partir de sa propre graine. */
export const generateLevel = (level: number, avoid?: ReadonlySet<string>): Level =>
  generateLevelFor(campaignSpec(level), level, avoid);

/**
 * Niveaux 1 à `count` de la campagne, encodés comme dans levels.ts, tous différents. `progress` est appelé après
 * chaque niveau.
 */
export function generateLevels(count: number, progress?: (level: number) => void): string[] {
  const levels: string[] = [];
  const seen = new Set<string>();
  for (let level = 1; level <= count; level++) {
    const text = levelToString(generateLevel(level, seen));
    seen.add(text);
    levels.push(text);
    progress?.(level);
  }
  return levels;
}
