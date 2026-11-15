import { describe, expect, it } from 'vitest';
import { countMoves, keptMoves } from '../../src/shared/games/moves.ts';

describe('compte des coups', () => {
  it('compte chaque coup et retire un coup par annulation', () => {
    expect(countMoves([])).toBe(0);
    expect(countMoves([{ type: 'move' }, { type: 'move' }])).toBe(2);
    expect(countMoves([{ type: 'move' }, { type: 'undo' }])).toBe(0);
    expect(countMoves([{ type: 'pour' }, { type: 'pour' }, { type: 'undo' }, { type: 'pour' }])).toBe(2);
  });

  it('garde les coups qui restent, dans l’ordre joué', () => {
    const a = { type: 'move', id: 'a' };
    const b = { type: 'move', id: 'b' };
    const c = { type: 'move', id: 'c' };
    const undo = { type: 'undo', id: '' };
    expect(keptMoves([a, b, undo, c])).toEqual([a, c]);
    expect(keptMoves([a, undo, b, c, undo, undo])).toEqual([]);
    expect(keptMoves([a, b, c])).toEqual([a, b, c]);
  });
});
