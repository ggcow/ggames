import { describe, expect, it } from 'vitest';
import { ChatThrottle, ReactionThrottle } from '../../src/worker/platform/throttle.ts';

describe('limite des réactions', () => {
  it('laisse passer une réaction par joueur et par intervalle', () => {
    const throttle = new ReactionThrottle(1000);
    expect(throttle.allow('a', 1000)).toBe(true);
    expect(throttle.allow('a', 1500)).toBe(false);
    expect(throttle.allow('b', 1500)).toBe(true);
    expect(throttle.allow('a', 2000)).toBe(true);
  });
});

describe('limite du salon', () => {
  it('laisse passer un nombre borné de messages par fenêtre glissante', () => {
    const throttle = new ChatThrottle(2, 1000);
    expect(throttle.allow('a', 1000)).toBe(true);
    expect(throttle.allow('a', 1100)).toBe(true);
    expect(throttle.allow('a', 1200)).toBe(false);
    expect(throttle.allow('b', 1200)).toBe(true);
    expect(throttle.allow('a', 2100)).toBe(true);
  });
});
