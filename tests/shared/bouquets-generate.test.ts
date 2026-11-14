import { describe, expect, it } from 'vitest';
import {
  type BoardSpec,
  campaignSpec,
  generateLevels,
  isPlayableStart,
  naiveWinRate,
  randomBoard,
  solve,
  targetWinRate,
} from '../../src/shared/games/bouquets/generate.ts';
import { LEVELS } from '../../src/shared/games/bouquets/levels.ts';
import {
  applyMove,
  type Board,
  cloneBoard,
  FLOWER_KINDS,
  frontOf,
  isSolved,
  SLOTS,
} from '../../src/shared/games/bouquets/rules.ts';
import { createRandom } from '../../src/shared/games/random.ts';

const _ = null;

describe('solveur', () => {
  it('trouve une suite de coups qui vide le plateau', () => {
    const start: Board = [
      [
        [0, 1, _],
        [1, 0, _],
      ],
      [[1, 0, _]],
      [[_, _, _]],
    ];
    const moves = solve(start, 10_000);
    expect(moves).not.toBeNull();
    const board = cloneBoard(start);
    for (const move of moves ?? []) expect(applyMove(board, move)).not.toBeNull();
    expect(isSolved(board)).toBe(true);
  });

  it('ne propose aucun coup sur un plateau déjà vide', () => {
    expect(solve([[[_, _, _]]], 10)).toEqual([]);
  });

  it('renonce à un plateau impossible ou trop long à explorer', () => {
    expect(solve([[[0, 1, 2]], [[1, 2, 0]]], 10_000)).toBeNull();
    const start: Board = [[[0, 1, _]], [[1, 0, _]], [[2, 2, _]], [[2, 0, 1]]];
    expect(solve(start, 0)).toBeNull();
  });
});

describe('difficulté', () => {
  it('donne 100 % de réussite sur un plateau où il suffit de former le bouquet', () => {
    expect(naiveWinRate([[[0, 0, _]], [[0, _, _]]], 1, 20)).toBe(1);
  });

  it('donne 0 % de réussite sur un plateau bloqué', () => {
    expect(naiveWinRate([[[0, 1, 2]], [[1, 2, 0]]], 1, 20)).toBe(0);
  });

  it('donne le même résultat pour une même graine', () => {
    const board = randomBoard(campaignSpec(30), createRandom(5));
    expect(naiveWinRate(board, 9, 30)).toBe(naiveWinRate(board, 9, 30));
  });
});

describe('tirage', () => {
  const spec: BoardSpec = { pots: 6, kinds: 5, depth: 2, free: 3 };

  it('met chaque espèce par trois, avec toutes les espèces demandées et les places libres au devant', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const board = randomBoard(spec, createRandom(seed));
      expect(board).toHaveLength(spec.pots);
      expect(board.every((pot) => pot.length <= spec.depth + 1)).toBe(true);
      const counts = new Map<number, number>();
      for (const slot of board.flat(2)) if (slot !== null) counts.set(slot, (counts.get(slot) ?? 0) + 1);
      expect(counts.size).toBe(spec.kinds);
      expect([...counts.values()].every((count) => count % SLOTS === 0)).toBe(true);
      const free = board.reduce((n, pot) => n + frontOf(pot).filter((slot) => slot === null).length, 0);
      expect(free).toBeGreaterThanOrEqual(spec.free);
      expect(randomBoard(spec, createRandom(seed))).toEqual(board);
    }
  });

  it('refuse un départ avec une couche de trois fleurs pareilles ou une couche cachée vide', () => {
    expect(isPlayableStart([[[0, 1, _]], [[1, 0, 1]], [[0, _, _]]])).toBe(true);
    expect(isPlayableStart([[[0, 0, 0]]])).toBe(false);
    expect(
      isPlayableStart([
        [
          [0, 1, _],
          [2, 2, 2],
        ],
      ]),
    ).toBe(false);
    expect(
      isPlayableStart([
        [
          [0, 1, _],
          [_, _, _],
        ],
      ]),
    ).toBe(false);
  });
});

describe('campagne', () => {
  it('apprend, puis serre la place : moins de pots, plus de couches cachées', () => {
    expect([1, 2, 5, 29, 100].map((level) => campaignSpec(level).kinds)).toEqual([2, 3, 4, 12, FLOWER_KINDS]);
    expect([1, 3, 15, 39, 40, 69, 70, 100].map((level) => campaignSpec(level).pots)).toEqual([3, 4, 8, 8, 7, 7, 6, 6]);
    expect([1, 3, 15, 40, 70].map((level) => campaignSpec(level).depth)).toEqual([0, 1, 2, 3, 4]);
    expect([1, 39, 40, 100].map((level) => campaignSpec(level).free)).toEqual([3, 3, 2, 2]);
  });

  it('vise une réussite qui baisse, avec un niveau plus dur tous les dix niveaux puis un répit', () => {
    expect(targetWinRate(1)).toBeCloseTo(0.95);
    expect(targetWinRate(99)).toBeLessThan(targetWinRate(50));
    expect(targetWinRate(20)).toBeLessThan(targetWinRate(19));
    expect(targetWinRate(21)).toBeGreaterThan(targetWinRate(22));
    expect(targetWinRate(100)).toBeGreaterThanOrEqual(0.05);
  });

  it('reproduit les premiers niveaux enregistrés', () => {
    expect(generateLevels(3)).toEqual(LEVELS.slice(0, 3));
  });
});
