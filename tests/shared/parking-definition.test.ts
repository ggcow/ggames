import { describe, expect, it } from 'vitest';
import { MAX_LEVEL } from '../../src/shared/games/campaign.ts';
import {
  decodeActions,
  encodeActions,
  levelBoard,
  type ParkingAction,
  parking,
  playActions,
  startBoard,
} from '../../src/shared/games/parking/definition.ts';
import { LEVELS } from '../../src/shared/games/parking/levels.ts';
import { OPTIMAL } from '../../src/shared/games/parking/optimal.ts';
import { boardToString, isSolved, parseBoard, shortestSolution, slide } from '../../src/shared/games/parking/rules.ts';
import { parkingLevel, parkingWin } from '../support/parking.ts';

describe('campagne', () => {
  it('enregistre un parking valide et pas encore gagné pour chaque niveau, tous différents', () => {
    expect(LEVELS).toHaveLength(MAX_LEVEL);
    expect(new Set(LEVELS).size).toBe(MAX_LEVEL);
    for (const text of LEVELS) {
      const board = parseBoard(text);
      expect(board && boardToString(board)).toBe(text);
      expect(board && isSolved(board)).toBe(false);
    }
  });

  it('n’a pas de niveau hors de la campagne', () => {
    expect(levelBoard(0)).toBeNull();
    expect(levelBoard(MAX_LEVEL + 1)).toBeNull();
    expect(startBoard('x:1')).toBeNull();
    expect(startBoard('c:1')).toEqual(parkingLevel(1));
  });
});

describe('clés', () => {
  it('suit la campagne commune', () => {
    expect(parking.isValidKey('c:1')).toBe(true);
    expect(parking.isValidKey('c:100')).toBe(true);
    expect(parking.isValidKey('c:101')).toBe(false);
    expect(['c:10', 'c:2', 'c:1'].sort(parking.compareKeys)).toEqual(['c:1', 'c:2', 'c:10']);
    expect(parking.isUnlocked('c:2', new Set(['c:1']))).toBe(true);
    expect(parking.isUnlocked('c:3', new Set(['c:2']))).toBe(false);
  });
});

describe('replays', () => {
  const actions: ParkingAction[] = [
    { type: 'slide', vehicle: 1, delta: 2 },
    { type: 'undo' },
    { type: 'slide', vehicle: 14, delta: -4 },
  ];

  it('encode et décode les actions', () => {
    expect(encodeActions(actions)).toBe('b+2uo-4');
    expect(decodeActions('b+2uo-4')).toEqual(actions);
    expect(decodeActions('')).toEqual([]);
  });

  it.each(['b', 'b+', 'b+0', 'b+5', 'b2', 'p+1', 'B+1', 'b*1', 'uu+1'])(
    'rejette un replay mal formé : %s',
    (replay) => {
      expect(decodeActions(replay)).toBeNull();
    },
  );

  it('rejoue les états et gère l’annulation', () => {
    const start = parkingLevel(1);
    const [first] = parkingWin(1);
    if (first?.type !== 'slide') throw new Error('coup attendu');
    const moved = slide(start, first);
    expect(moved).not.toBeNull();
    expect(playActions(start, [first, { type: 'undo' }, first])).toEqual([start, moved, start, moved]);
  });

  it('refuse un glissement impossible ou une annulation sans historique', () => {
    const start = parkingLevel(1);
    expect(playActions(start, [{ type: 'undo' }])).toBeNull();
    expect(playActions(start, [{ type: 'slide', vehicle: 0, delta: -1 }])).toBeNull();
    expect(playActions(start, [{ type: 'slide', vehicle: 14, delta: 1 }])).toBeNull();
  });

  it('valide une victoire, compte chaque coup et retire un coup par annulation', () => {
    const win = parkingWin(1);
    const [first] = win;
    if (!first) throw new Error('coup attendu');
    expect(parking.replay('c:1', encodeActions(win))).toEqual({ finished: true, value: win.length });
    expect(parking.replay('c:1', encodeActions([first, { type: 'undo' }, ...win]))).toEqual({
      finished: true,
      value: win.length,
    });
    expect(parking.replay('c:1', encodeActions([first]))).toEqual({ finished: false, value: 1 });
  });

  it('refuse des actions après la victoire', () => {
    expect(parking.replay('c:1', encodeActions([...parkingWin(1), { type: 'undo' }]))).toBeNull();
  });

  it('refuse une clé invalide, un replay mal formé ou un coup impossible', () => {
    expect(parking.replay('x:1', '')).toBeNull();
    expect(parking.replay('c:1', 'zz')).toBeNull();
    expect(parking.replay('c:1', 'u')).toBeNull();
  });
});

describe('meilleur score possible', () => {
  it('donne une valeur par niveau de la campagne, et rien pour une clé inconnue', () => {
    expect(OPTIMAL).toHaveLength(MAX_LEVEL);
    expect(parking.bestPossible('c:1')).toBe(OPTIMAL[0]);
    expect(parking.bestPossible(`c:${MAX_LEVEL}`)).toBe(OPTIMAL[MAX_LEVEL - 1]);
    expect(parking.bestPossible('c:0')).toBeNull();
  });

  it('correspond à la recherche exhaustive sur chaque niveau', { timeout: 120_000 }, () => {
    LEVELS.forEach((_, index) => {
      const result = shortestSolution(parkingLevel(index + 1), 1_000_000);
      expect(result.kind === 'solved' ? result.slides.length : null).toBe(OPTIMAL[index]);
    });
  });

  it.each([1, 50, 100])('est atteint par une vraie partie au niveau %i', (level) => {
    expect(parking.replay(`c:${level}`, encodeActions(parkingWin(level)))).toEqual({
      finished: true,
      value: OPTIMAL[level - 1],
    });
  });
});
