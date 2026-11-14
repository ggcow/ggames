import { describe, expect, it } from 'vitest';
import { createRandom, shuffle } from '../../src/shared/games/random.ts';

describe('createRandom', () => {
  it('produit la même suite pour une même graine', () => {
    const a = createRandom(42);
    const b = createRandom(42);
    expect(Array.from({ length: 5 }, a)).toEqual(Array.from({ length: 5 }, b));
  });

  it('produit des valeurs dans [0, 1[', () => {
    const random = createRandom(7);
    for (let i = 0; i < 1000; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('shuffle', () => {
  it('mélange sur place en gardant les mêmes éléments', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const result = shuffle(items, createRandom(3));
    expect(result).toBe(items);
    expect([...result].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('donne le même ordre pour une même graine', () => {
    const a = shuffle([...'abcdefgh'], createRandom(11));
    const b = shuffle([...'abcdefgh'], createRandom(11));
    expect(a).toEqual(b);
  });
});
