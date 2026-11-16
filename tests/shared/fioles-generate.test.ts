import { describe, expect, it } from 'vitest';
import {
  campaignSpec,
  generateBoard,
  generateLevels,
  isSolvable,
  minimalMoves,
  solverEffort,
} from '../../src/shared/games/fioles/generate.ts';
import { LEVELS } from '../../src/shared/games/fioles/levels.ts';
import { CAP, isSolved, MAX_COLORS } from '../../src/shared/games/fioles/rules.ts';
import { solve } from '../support/fioles-solver.ts';

describe('campagne', () => {
  it('ajoute une couleur par niveau jusqu’au niveau 10, puis multiplie les plateaux candidats', () => {
    expect([1, 2, 5, 10, 11, 500].map((level) => campaignSpec(level).colors)).toEqual([3, 4, 7, 12, 12, MAX_COLORS]);
    expect([1, 2, 3, 40].map((level) => campaignSpec(level).noAdjacentPairs)).toEqual([false, false, true, true]);
    expect([1, 10, 11, 20, 50, 500].map((level) => campaignSpec(level).candidates)).toEqual([1, 1, 2, 11, 41, 41]);
    expect(campaignSpec(7).empty).toBe(2);
  });

  it('reproduit les niveaux enregistrés, y compris un niveau tiré à nouveau pour éviter un doublon', () => {
    // Le niveau 24 sortait identique au 23 : il est tiré avec une graine de remplacement.
    const levels = generateLevels(24);
    expect(levels).toEqual(LEVELS.slice(0, 24));
    expect(new Set(levels).size).toBe(24);
  });
});

describe('plus petit nombre de versements', () => {
  it('vaut zéro pour un plateau résolu et compte chaque versement nécessaire', () => {
    expect(minimalMoves([[0, 0, 0, 0], []], 100)).toBe(0);
    expect(minimalMoves([[0, 0, 0, 0], [1, 1, 1], [1]], 100)).toBe(1);
    // Recoupé par le solveur de test, qui explore toutes les positions sans les regrouper.
    const board = [[0, 1, 0, 1], [1, 0, 1, 0], [], []];
    expect(minimalMoves(board, 100_000)).toBe(solve(board)?.length);
    expect(minimalMoves(board, 100_000)).toBe(7);
  });

  it('renonce au-delà du nombre de positions permis ou sur un plateau impossible', () => {
    expect(minimalMoves([[0, 1, 0, 1], [1, 0, 1, 0], [], []], 1)).toBeNull();
    expect(
      minimalMoves(
        [
          [0, 1, 0, 1],
          [1, 0, 1, 0],
        ],
        100,
      ),
    ).toBeNull();
  });
});

describe('solveur et génération', () => {
  it('trouve qu’un plateau simple est faisable', () => {
    expect(isSolvable([[0, 1, 0, 1], [1, 0, 1, 0], [], []], 10_000)).toBe(true);
  });

  it('détecte un plateau bloqué', () => {
    expect(
      isSolvable(
        [
          [0, 1, 0, 1],
          [1, 0, 1, 0],
        ],
        10_000,
      ),
    ).toBe(false);
  });

  const spec = { colors: 6, empty: 2, noAdjacentPairs: false, candidates: 1 };

  it('génère un plateau valide, faisable et déterministe', () => {
    const board = generateBoard(spec, 99);
    expect(board).toHaveLength(8);
    expect(board.slice(6)).toEqual([[], []]);
    expect(board.flat()).toHaveLength(6 * CAP);
    expect(isSolved(board)).toBe(false);
    expect(isSolvable(board, 500_000)).toBe(true);
    expect(generateBoard(spec, 99)).toEqual(board);
  });

  it('respecte l’interdiction des paires collées', () => {
    const board = generateBoard({ ...spec, noAdjacentPairs: true }, 7);
    expect(board.every((tube) => tube.every((color, i) => i === 0 || tube[i - 1] !== color))).toBe(true);
  });

  it('garde le plateau le plus difficile parmi les candidats', () => {
    const many = generateBoard({ ...spec, candidates: 6 }, 3);
    const single = generateBoard(spec, 3);
    expect(solverEffort(many, 500_000)).toBeGreaterThanOrEqual(solverEffort(single, 500_000) ?? 0);
  });

  it('mesure l’effort du solveur et renvoie null au-delà de la limite', () => {
    const board = [[0, 1, 0, 1], [1, 0, 1, 0], [], []];
    expect(solverEffort(board, 10_000)).toBeGreaterThan(0);
    expect(solverEffort(board, 0)).toBeNull();
    expect(solverEffort([[0, 0, 0, 0], []], 10)).toBe(0);
  });
});
