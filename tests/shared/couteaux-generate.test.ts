import { describe, expect, it } from 'vitest';
import { MAX_LEVEL } from '../../src/shared/games/campaign.ts';
import {
  campaignSpec,
  generateLevel,
  generateLevelFor,
  generateLevels,
  MAX_WAIT,
  MIN_WINDOW,
  perfectThrows,
  randomLevel,
} from '../../src/shared/games/couteaux/generate.ts';
import { LEVELS } from '../../src/shared/games/couteaux/levels.ts';
import {
  distance,
  FLIGHT_TICKS,
  GAP,
  hits,
  impactAt,
  type Level,
  levelToString,
  MAX_KNIVES,
  MAX_OBSTACLES,
  MAX_SPEED,
  rotationOf,
} from '../../src/shared/games/couteaux/rules.ts';
import { createRandom } from '../../src/shared/games/random.ts';

describe('campagne', () => {
  it('ajoute couteaux, obstacles, vitesse, changements de vitesse puis de sens', () => {
    const specs = Array.from({ length: MAX_LEVEL }, (_, i) => campaignSpec(i + 1));
    expect(specs[0]).toEqual({ knives: 6, obstacles: 0, speed: 15, paces: 1, reverse: false });
    expect(specs[MAX_LEVEL - 1]).toMatchObject({ knives: 14, obstacles: 7, speed: 40, paces: 4, reverse: true });
    expect([10, 11, 30, 31, 60, 61].map((level) => campaignSpec(level).paces)).toEqual([1, 2, 2, 3, 3, 4]);
    specs.slice(1).forEach((spec, i) => {
      const previous = specs[i];
      if (!previous) throw new Error('niveau précédent attendu');
      for (const field of ['knives', 'obstacles', 'speed', 'paces'] as const) {
        expect(spec[field]).toBeGreaterThanOrEqual(previous[field]);
      }
      expect(spec.knives).toBeLessThanOrEqual(MAX_KNIVES);
      expect(spec.obstacles).toBeLessThanOrEqual(MAX_OBSTACLES);
    });
  });

  it('reproduit les niveaux enregistrés', () => {
    expect(generateLevels(3, () => undefined)).toEqual(LEVELS.slice(0, 3));
    expect(levelToString(generateLevel(70))).toBe(LEVELS[69]);
  });
});

describe('tirage', () => {
  it('espace les obstacles et borne la vitesse ; la rotation reboucle sur sa première vitesse', () => {
    const random = createRandom(4);
    for (let i = 0; i < 30; i++) {
      const level = randomLevel({ knives: 10, obstacles: 6, speed: 40, paces: 4, reverse: true }, random);
      level.obstacles.forEach((angle, index) => {
        for (const other of level.obstacles.slice(index + 1))
          expect(distance(angle, other)).toBeGreaterThanOrEqual(2 * GAP);
      });
      expect(level.spin).toHaveLength(8);
      level.spin.forEach((spin, index) => {
        expect(Math.abs(spin.from)).toBeLessThanOrEqual(MAX_SPEED);
        const next = level.spin[(index + 1) % level.spin.length];
        expect(next?.from).toBe(spin.to);
      });
    }
  });

  it('tient une vitesse constante sur un niveau à une seule vitesse', () => {
    const level = randomLevel({ knives: 6, obstacles: 0, speed: 15, paces: 1, reverse: false }, createRandom(1));
    expect(level.spin).toHaveLength(1);
    expect(level.spin[0]?.from).toBe(level.spin[0]?.to);
  });
});

describe('partie sans rebond', () => {
  it('lance chaque couteau au milieu d’une fenêtre assez large, sans rien toucher', () => {
    const level = generateLevel(80);
    const rotation = rotationOf(level);
    const ticks = perfectThrows(level) ?? [];
    expect(ticks).toHaveLength(level.knives);
    const planted: number[] = [];
    ticks.forEach((tick, index) => {
      if (index > 0) expect(tick - (ticks[index - 1] ?? 0)).toBeGreaterThanOrEqual(FLIGHT_TICKS);
      for (let offset = -Math.floor(MIN_WINDOW / 2); offset <= Math.floor(MIN_WINDOW / 2); offset++) {
        expect(hits(level, planted, impactAt(rotation, tick + offset + FLIGHT_TICKS))).toBe(false);
      }
      planted.push(impactAt(rotation, tick + FLIGHT_TICKS));
    });
  });

  it('échoue quand la planète ne présente jamais de place libre', () => {
    // Immobile, tournée vers un obstacle : aucun couteau ne se plante.
    const blocked: Level = { knives: 1, obstacles: [0], spin: [{ ticks: MAX_WAIT, from: 0, to: 0 }] };
    expect(perfectThrows(blocked)).toBeNull();
  });
});

describe('recherche', () => {
  const spec = { knives: 8, obstacles: 3, speed: 25, paces: 2, reverse: false };

  it('tire un niveau gagnable, le même pour une même graine', () => {
    const level = generateLevelFor(spec, 3);
    expect(generateLevelFor(spec, 3)).toEqual(level);
    expect(perfectThrows(level)).not.toBeNull();
  });

  it('écarte les niveaux déjà retenus', () => {
    const first = levelToString(generateLevelFor(spec, 3));
    expect(levelToString(generateLevelFor(spec, 3, new Set([first])))).not.toBe(first);
  });

  it('échoue quand aucun tirage n’est gagnable', () => {
    expect(() => generateLevelFor({ ...spec, knives: MAX_KNIVES, obstacles: 8 }, 1, new Set(), 0)).toThrow(
      /20 couteaux après 0 tirages/,
    );
  });
});
