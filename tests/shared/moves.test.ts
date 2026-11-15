import { describe, expect, it } from 'vitest';
import { countMoves } from '../../src/shared/games/moves.ts';

describe('compte des coups', () => {
  it('compte chaque coup et retire un coup par annulation', () => {
    expect(countMoves([])).toBe(0);
    expect(countMoves([{ type: 'move' }, { type: 'move' }])).toBe(2);
    expect(countMoves([{ type: 'move' }, { type: 'undo' }])).toBe(0);
    expect(countMoves([{ type: 'pour' }, { type: 'pour' }, { type: 'undo' }, { type: 'pour' }])).toBe(2);
  });
});
