import { describe, expect, it } from 'vitest';
import {
  canThrow,
  distance,
  FLIGHT_TICKS,
  GAP,
  hits,
  impactAt,
  isLost,
  isWon,
  type Level,
  LIVES,
  levelToString,
  liveState,
  MAX_KNIVES,
  MAX_OBSTACLES,
  MAX_SPEED,
  parseLevel,
  parseLiveState,
  room,
  rotationOf,
  START,
  THROW_TICKS,
  TURN,
  throwKnife,
  turnedAt,
  wrap,
} from '../../src/shared/games/couteaux/rules.ts';

/** Planète à vitesse constante : 10 dixièmes de degré par pas, un tour en 360 pas. */
const STEADY: Level = { knives: 3, obstacles: [], spin: [{ ticks: 360, from: 10, to: 10 }] };

describe('angles', () => {
  it('ramène un angle dans un tour et mesure l’écart par le plus court chemin', () => {
    expect(wrap(-1)).toBe(TURN - 1);
    expect(wrap(TURN + 5)).toBe(5);
    expect(distance(10, TURN - 10)).toBe(20);
    expect(distance(0, TURN / 2)).toBe(TURN / 2);
  });
});

describe('rotation', () => {
  it('tourne à vitesse constante, cycle après cycle', () => {
    const rotation = rotationOf(STEADY);
    expect(turnedAt(rotation, 0)).toBe(0);
    expect(turnedAt(rotation, 7)).toBe(70);
    expect(turnedAt(rotation, 360)).toBe(TURN);
    expect(turnedAt(rotation, 725)).toBe(2 * TURN + 50);
    expect(impactAt(rotation, 9)).toBe(TURN - 90);
  });

  it('accélère régulièrement pendant une phase puis enchaîne la suivante', () => {
    const level: Level = {
      knives: 1,
      obstacles: [],
      spin: [
        { ticks: 4, from: 0, to: 8 },
        { ticks: 2, from: -5, to: -5 },
      ],
    };
    const rotation = rotationOf(level);
    // Vitesses 0, 2, 4, 6 puis -5, -5.
    expect([0, 1, 2, 3, 4, 5, 6].map((tick) => turnedAt(rotation, tick))).toEqual([0, 0, 2, 6, 12, 7, 2]);
    // Un cycle fait tourner de 2 : au pas 8, un cycle et deux pas.
    expect(turnedAt(rotation, 8)).toBe(4);
    expect(turnedAt(rotation, 12)).toBe(4);
  });
});

describe('lancers', () => {
  const rotation = rotationOf(STEADY);

  it('plante le couteau là où la planète est tournée vers le bas à son arrivée', () => {
    const result = throwKnife(STEADY, rotation, START, 4);
    const arrival = 4 + FLIGHT_TICKS;
    expect(result).toMatchObject({ angle: impactAt(rotation, arrival), bounced: false, arrival });
    expect(result?.throws).toEqual({ planted: [wrap(-10 * arrival)], misses: 0, last: 4 });
  });

  it('fait rebondir un couteau trop près d’un autre et compte une erreur', () => {
    const first = throwKnife(STEADY, rotation, START, 0);
    if (!first) throw new Error('lancer attendu');
    // Un tour plus tard, à 5 degrés près : la planète présente de nouveau le premier couteau.
    const near = throwKnife(STEADY, rotation, first.throws, 365);
    expect(near?.bounced).toBe(true);
    expect(near?.throws).toEqual({ planted: first.throws.planted, misses: 1, last: 365 });
    // Juste après l'arrivée du premier : la planète a tourné de 45 degrés, assez pour l'éviter.
    const far = throwKnife(STEADY, rotation, first.throws, FLIGHT_TICKS);
    expect(far?.bounced).toBe(false);
    expect(throwKnife(STEADY, rotation, first.throws, GAP / 10 + 360 - 1)?.bounced).toBe(true);
  });

  it('lance pendant le vol du précédent : le couteau en vol compte déjà comme planté', () => {
    const first = throwKnife(STEADY, rotation, START, 0);
    if (!first) throw new Error('lancer attendu');
    expect(first.arrival).toBeGreaterThan(THROW_TICKS);
    // Six pas plus tard, la planète n'a tourné que de 6 degrés : trop près du premier.
    expect(throwKnife(STEADY, rotation, first.throws, THROW_TICKS)?.bounced).toBe(true);
    // Douze pas plus tard, 12 degrés : il se plante à côté, avant même que le premier arrive.
    const second = throwKnife(STEADY, rotation, first.throws, 2 * THROW_TICKS);
    expect(second?.bounced).toBe(false);
    expect(second?.throws.planted).toHaveLength(2);
  });

  it('rebondit aussi sur un obstacle', () => {
    const target = wrap(-10 * FLIGHT_TICKS);
    const level: Level = { ...STEADY, obstacles: [target] };
    expect(throwKnife(level, rotationOf(level), START, 0)?.bounced).toBe(true);
    expect(hits(level, [], wrap(target + GAP - 1))).toBe(true);
    expect(hits(level, [], wrap(target + GAP))).toBe(false);
  });

  it('refuse un lancer trop proche du précédent, à un pas invalide ou une fois la partie finie', () => {
    const first = throwKnife(STEADY, rotation, START, 0);
    if (!first) throw new Error('lancer attendu');
    expect(throwKnife(STEADY, rotation, first.throws, THROW_TICKS - 1)).toBeNull();
    expect(canThrow(STEADY, first.throws, THROW_TICKS - 1)).toBe(false);
    expect(canThrow(STEADY, first.throws, THROW_TICKS)).toBe(true);
    expect(throwKnife(STEADY, rotation, START, -1)).toBeNull();
    expect(throwKnife(STEADY, rotation, START, 1.5)).toBeNull();
    const won = { planted: [0, 1200, 2400], misses: 0, last: 0 };
    expect(isWon(STEADY, won)).toBe(true);
    expect(throwKnife(STEADY, rotation, won, 100)).toBeNull();
    const lost = { planted: [], misses: LIVES, last: 0 };
    expect(isLost(lost)).toBe(true);
    expect(throwKnife(STEADY, rotation, lost, 100)).toBeNull();
  });
});

describe('place restante', () => {
  it('compte les couteaux qu’on peut encore serrer dans chaque espace libre', () => {
    expect(room(STEADY, [])).toBe(TURN / GAP);
    expect(room(STEADY, [0])).toBe(TURN / GAP - 1);
    expect(room(STEADY, [0, 150])).toBe(TURN / GAP - 3);
    expect(room({ ...STEADY, obstacles: [0] }, [1800])).toBe(TURN / GAP - 2);
  });
});

describe('encodage d’un niveau', () => {
  const level: Level = {
    knives: 8,
    obstacles: [0, 1800],
    spin: [
      { ticks: 120, from: 10, to: 10 },
      { ticks: 60, from: 10, to: -20 },
    ],
  };

  it('relit ce qu’il écrit', () => {
    expect(levelToString(level)).toBe('8|0,1800|120:10:10,60:10:-20');
    expect(parseLevel(levelToString(level))).toEqual(level);
    expect(parseLevel('6||100:9:9')).toEqual({ knives: 6, obstacles: [], spin: [{ ticks: 100, from: 9, to: 9 }] });
  });

  it('refuse un niveau mal formé ou hors limites', () => {
    for (const text of [
      '',
      '0||10:1:1',
      `${MAX_KNIVES + 1}||10:1:1`,
      '6|3600|10:1:1',
      '6|a|10:1:1',
      `6|${Array.from({ length: MAX_OBSTACLES + 1 }, (_, i) => i * 300).join(',')}|10:1:1`,
      '6||',
      '6||0:1:1',
      `6||10:${MAX_SPEED + 1}:1`,
      '6||10:1',
      '6||10:1:1|x',
    ]) {
      expect(parseLevel(text)).toBeNull();
    }
  });
});

describe('état diffusé', () => {
  it('donne le niveau, les erreurs et les couteaux plantés, et relit ce qu’il écrit', () => {
    const state = liveState(12, { planted: [0, 35, TURN - 1], misses: 2, last: 3 });
    expect(state).toBe('12!2!00000z2rz');
    expect(parseLiveState(state)).toEqual({ level: 12, misses: 2, planted: [0, 35, TURN - 1] });
    expect(parseLiveState(liveState(1, START))).toEqual({ level: 1, misses: 0, planted: [] });
  });

  it('refuse un état illisible', () => {
    for (const state of ['', '12!2', 'x!0!', '1!0!00', '1!0!2s0', `1!0!${'000'.repeat(MAX_KNIVES + 1)}`]) {
      expect(parseLiveState(state)).toBeNull();
    }
  });
});
