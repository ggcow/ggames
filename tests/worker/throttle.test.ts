import { describe, expect, it } from 'vitest';
import { ReactionThrottle } from '../../src/worker/platform/throttle.ts';

describe('limite des réactions', () => {
  it('laisse passer une réaction par joueur et par intervalle', () => {
    const throttle = new ReactionThrottle(1000);
    expect(throttle.allow('a', 1000)).toBe(true);
    expect(throttle.allow('a', 1500)).toBe(false);
    expect(throttle.allow('b', 1500)).toBe(true);
    expect(throttle.allow('a', 2000)).toBe(true);
  });
});
