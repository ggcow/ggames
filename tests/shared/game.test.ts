import { describe, expect, it } from 'vitest';
import { isAtLeastAsGood } from '../../src/shared/games/game.ts';

describe('comparaison des scores', () => {
  it('compte l’égalité comme aussi bien, dans les deux ordres', () => {
    expect(isAtLeastAsGood(10, 12, 'asc')).toBe(true);
    expect(isAtLeastAsGood(12, 12, 'asc')).toBe(true);
    expect(isAtLeastAsGood(13, 12, 'asc')).toBe(false);
    expect(isAtLeastAsGood(13, 12, 'desc')).toBe(true);
    expect(isAtLeastAsGood(12, 12, 'desc')).toBe(true);
    expect(isAtLeastAsGood(10, 12, 'desc')).toBe(false);
  });
});
