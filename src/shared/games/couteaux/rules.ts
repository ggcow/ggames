// Règles du jeu Couteaux : une planète tourne, on lance des couteaux depuis le bas pour les y planter, et un
// couteau qui en touche un autre déjà planté rebondit. Code pur, sans DOM ni Cloudflare : utilisé par le client,
// le serveur et les tests. La génération des niveaux est dans generate.ts.
//
// Le temps avance par pas fixes (`TICKS_PER_SECOND`) et toute la rotation se calcule en entiers : le serveur
// retrouve exactement, à partir des seuls instants des lancers, où chaque couteau s'est planté.

/** Pas de temps par seconde : un lancer est daté au pas près. */
export const TICKS_PER_SECOND = 60;

/** Durée d'un pas, en millisecondes. */
export const TICK_MS = 1000 / TICKS_PER_SECOND;

/** Un tour complet, en dixièmes de degré : l'unité de tous les angles. */
export const TURN = 3600;

/**
 * Pas de vol d'un couteau, du lancer jusqu'à la planète : trois quarts de seconde, pendant lesquels la planète
 * continue de tourner. Il faut lancer en avance sur la place visée.
 */
export const FLIGHT_TICKS = 45;

/**
 * Pas au moins entre deux lancers : un dixième de seconde. Plusieurs couteaux peuvent voler en même temps ; ils
 * arrivent dans l'ordre des lancers, chacun sur la planète où les précédents sont déjà plantés.
 */
export const THROW_TICKS = 6;

/** Écart minimal entre deux couteaux plantés : plus près, le nouveau touche l'ancien et rebondit. */
export const GAP = 100;

/** Erreurs permises : au troisième rebond, la partie est perdue. */
export const LIVES = 3;

/** Couteaux à planter au plus dans un niveau, et couteaux déjà plantés au plus au départ. */
export const MAX_KNIVES = 20;
export const MAX_OBSTACLES = 8;

/** Vitesse de rotation au plus, en dixièmes de degré par pas (dans un sens ou dans l'autre). */
export const MAX_SPEED = 60;

/**
 * Une phase de la rotation : pendant `ticks` pas, la vitesse (dixièmes de degré par pas, positive dans le sens
 * des aiguilles d'une montre) passe régulièrement de `from` à `to`. Les phases d'un niveau se répètent en boucle.
 */
export interface Spin {
  readonly ticks: number;
  readonly from: number;
  readonly to: number;
}

export interface Level {
  /** Couteaux à planter pour gagner. */
  readonly knives: number;
  /** Couteaux déjà plantés au départ : leur angle sur la planète, 0 tourné vers le bas au départ. */
  readonly obstacles: readonly number[];
  readonly spin: readonly Spin[];
}

/** Reste positif de `value` modulo `TURN`. */
export const wrap = (value: number): number => ((value % TURN) + TURN) % TURN;

/** Écart entre deux angles, par le plus court chemin. */
export function distance(a: number, b: number): number {
  const gap = wrap(a - b);
  return Math.min(gap, TURN - gap);
}

/* ---------- Rotation ---------- */

/** Vitesse au pas `step` d'une phase. */
const speedAt = (spin: Spin, step: number): number =>
  spin.from + Math.floor(((spin.to - spin.from) * step) / spin.ticks);

/**
 * Rotation d'un niveau, calculée une fois : l'angle cumulé à chaque pas d'un cycle de ses phases. La planète a
 * tourné de `turned[t]` au pas t du premier cycle, et de `shift` à chaque cycle complet.
 */
export interface Rotation {
  readonly turned: readonly number[];
  readonly shift: number;
}

export function rotationOf(level: Level): Rotation {
  const turned = [0];
  for (const spin of level.spin) {
    for (let step = 0; step < spin.ticks; step++) turned.push((turned[turned.length - 1] ?? 0) + speedAt(spin, step));
  }
  const shift = turned.pop() ?? 0;
  return { turned, shift };
}

/** Rotation totale de la planète au pas `tick` depuis le départ, sans la ramener à un tour. */
export function turnedAt(rotation: Rotation, tick: number): number {
  const length = rotation.turned.length;
  return Math.floor(tick / length) * rotation.shift + (rotation.turned[tick % length] ?? 0);
}

/** Angle, sur la planète, du point tourné vers le bas au pas `tick` : là où se plante un couteau qui arrive. */
export const impactAt = (rotation: Rotation, tick: number): number => wrap(-turnedAt(rotation, tick));

/* ---------- Partie ---------- */

/** Où en est une partie. */
export interface Throws {
  /** Angles des couteaux plantés par le joueur, dans l'ordre. */
  readonly planted: readonly number[];
  /** Rebonds. */
  readonly misses: number;
  /** Pas du dernier lancer, `null` avant le premier. */
  readonly last: number | null;
}

export const START: Throws = { planted: [], misses: 0, last: null };

export const isWon = (level: Level, throws: Throws): boolean => throws.planted.length >= level.knives;
export const isLost = (throws: Throws): boolean => throws.misses >= LIVES;

/** Vrai si un couteau arrivant à `angle` touche un couteau déjà planté (obstacle compris). */
export const hits = (level: Level, planted: readonly number[], angle: number): boolean =>
  [...level.obstacles, ...planted].some((other) => distance(other, angle) < GAP);

/** Résultat d'un lancer : l'état suivant, l'angle où le couteau arrive et s'il y rebondit. */
export interface Throw {
  throws: Throws;
  angle: number;
  bounced: boolean;
  /** Pas où le couteau arrive sur la planète. */
  arrival: number;
}

/**
 * Vrai si un couteau peut partir au pas `tick` : pas entier, assez loin du lancer précédent, et partie ni gagnée
 * ni perdue. Les couteaux encore en vol comptent déjà : une fois le dernier couteau utile ou la dernière erreur
 * lancés, plus rien ne part.
 */
export const canThrow = (level: Level, throws: Throws, tick: number): boolean =>
  Number.isInteger(tick) &&
  tick >= 0 &&
  (throws.last === null || tick >= throws.last + THROW_TICKS) &&
  !isWon(level, throws) &&
  !isLost(throws);

/** Lance un couteau au pas `tick`. `null` si le lancer est impossible (`canThrow`). */
export function throwKnife(level: Level, rotation: Rotation, throws: Throws, tick: number): Throw | null {
  if (!canThrow(level, throws, tick)) return null;
  const arrival = tick + FLIGHT_TICKS;
  const angle = impactAt(rotation, arrival);
  const bounced = hits(level, throws.planted, angle);
  return {
    throws: bounced
      ? { planted: throws.planted, misses: throws.misses + 1, last: tick }
      : { planted: [...throws.planted, angle], misses: throws.misses, last: tick },
    angle,
    bounced,
    arrival,
  };
}

/**
 * Couteaux qu'on peut encore planter au plus, en les serrant au plus près dans chaque espace libre. S'il en
 * reste plus à planter, la partie ne peut plus être gagnée.
 */
export function room(level: Level, planted: readonly number[]): number {
  const all = [...level.obstacles, ...planted].map(wrap).sort((a, b) => a - b);
  if (all.length === 0) return Math.floor(TURN / GAP);
  return all.reduce((sum, angle, index) => {
    const next = index + 1 < all.length ? (all[index + 1] ?? 0) : (all[0] ?? 0) + TURN;
    return sum + Math.max(0, Math.floor((next - angle) / GAP) - 1);
  }, 0);
}

/* ---------- Encodage d'un niveau ---------- */

const NUMBER = '(-?\\d{1,4})';
const SPIN = new RegExp(`^${NUMBER}:${NUMBER}:${NUMBER}$`);

/**
 * Encodage texte d'un niveau, pour levels.ts : couteaux à planter, angles des obstacles, phases de rotation
 * (`pas:de:à`). Ex. "8|0,1800|120:10:10,60:10:-20".
 */
export const levelToString = (level: Level): string =>
  [
    level.knives,
    level.obstacles.join(','),
    level.spin.map((spin) => `${spin.ticks}:${spin.from}:${spin.to}`).join(','),
  ].join('|');

const isSpeed = (speed: number): boolean => Math.abs(speed) <= MAX_SPEED;

export function parseLevel(text: string): Level | null {
  const [knivesText = '', obstaclesText = '', spinText = '', ...rest] = text.split('|');
  if (rest.length > 0 || !/^\d{1,2}$/.test(knivesText)) return null;
  const knives = Number(knivesText);
  const obstacles =
    obstaclesText === '' ? [] : obstaclesText.split(',').map((angle) => (/^\d{1,4}$/.test(angle) ? Number(angle) : -1));
  const spin: Spin[] = [];
  for (const part of spinText.split(',')) {
    const match = SPIN.exec(part);
    if (!match) return null;
    const [ticks, from, to] = match.slice(1).map(Number) as [number, number, number];
    if (ticks < 1 || !isSpeed(from) || !isSpeed(to)) return null;
    spin.push({ ticks, from, to });
  }
  const valid =
    knives >= 1 &&
    knives <= MAX_KNIVES &&
    obstacles.length <= MAX_OBSTACLES &&
    obstacles.every((angle) => angle >= 0 && angle < TURN);
  return valid ? { knives, obstacles, spin } : null;
}

/* ---------- État diffusé ---------- */

/** Ce que voient les autres joueurs d'une partie : le niveau, les rebonds et les couteaux plantés. */
export interface LiveView {
  level: number;
  misses: number;
  planted: readonly number[];
}

/** Un angle en trois chiffres de base 36. */
const ANGLE_WIDTH = 3;

/** État d'une partie pour les autres joueurs : niveau, rebonds, puis chaque angle planté. Ex. "12!1!0a01z4". */
export const liveState = (level: number, throws: Throws): string =>
  `${level}!${throws.misses}!${throws.planted.map((angle) => angle.toString(36).padStart(ANGLE_WIDTH, '0')).join('')}`;

const LIVE_STATE = new RegExp(`^(\\d{1,3})!(\\d)!((?:[0-9a-z]{${ANGLE_WIDTH}}){0,${MAX_KNIVES}})$`);

export function parseLiveState(state: string): LiveView | null {
  const match = LIVE_STATE.exec(state);
  if (!match) return null;
  const planted = (match[3]?.match(new RegExp(`.{${ANGLE_WIDTH}}`, 'g')) ?? []).map((chunk) =>
    Number.parseInt(chunk, 36),
  );
  if (planted.some((angle) => angle >= TURN)) return null;
  return { level: Number(match[1]), misses: Number(match[2]), planted };
}
