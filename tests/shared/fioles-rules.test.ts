import { describe, expect, it } from 'vitest';
import {
  type Board,
  boardToString,
  CAP,
  canPour,
  generateBoard,
  isSolvable,
  isSolved,
  isTubeDone,
  parseBoard,
  pour,
  solverEffort,
} from '../../src/shared/games/fioles/rules.ts';

describe('versement', () => {
  it('verse toutes les boules du dessus de même couleur', () => {
    const board: Board = [[0, 1, 1], [1]];
    expect(pour(board, 0, 1)).toBe(2);
    expect(board).toEqual([[0], [1, 1, 1]]);
  });

  it('s’arrête quand la fiole cible est pleine', () => {
    const board: Board = [
      [1, 1, 1],
      [0, 1],
    ];
    expect(pour(board, 0, 1)).toBe(2);
    expect(board).toEqual([[1], [0, 1, 1, 1]]);
  });

  it.each([
    ['source vide', [], [0]],
    ['cible pleine', [0], [0, 0, 0, 0]],
    ['couleurs différentes', [1], [0]],
  ])('refuse : %s', (_, from, to) => {
    expect(canPour(from, to)).toBe(false);
    expect(pour([from, to], 0, 1)).toBe(0);
  });

  it('accepte une fiole vide comme cible', () => {
    expect(canPour([2], [])).toBe(true);
  });

  it('refuse un index hors plateau ou identique', () => {
    expect(pour([[0], []], 0, 5)).toBe(0);
    expect(pour([[0], []], 0, 0)).toBe(0);
  });
});

describe('état', () => {
  it('reconnaît une fiole terminée', () => {
    expect(isTubeDone([3, 3, 3, 3])).toBe(true);
    expect(isTubeDone([3, 3, 3])).toBe(false);
    expect(isTubeDone([3, 3, 3, 2])).toBe(false);
  });

  it('reconnaît un plateau résolu', () => {
    expect(isSolved([[0, 0, 0, 0], [], [1, 1, 1, 1]])).toBe(true);
    expect(isSolved([[0, 0, 0], [0], [1, 1, 1, 1]])).toBe(false);
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

describe('encodage texte', () => {
  it('fait l’aller-retour', () => {
    const board: Board = [[0, 1, 2, 0], [1, 2, 0, 1], [2, 0, 1, 2], [], []];
    expect(boardToString(board)).toBe('abca.bcab.cabc..');
    expect(parseBoard(boardToString(board))).toEqual(board);
  });

  it.each([
    ['couleur incomplète', 'abca.bcab..'],
    ['fiole trop pleine', 'aaaaa.bbbb.cccc'],
    ['lettre inconnue', 'zzzz.bbbb.cccc'],
    ['trop peu de fioles', 'aaaa.'],
    ['aucune boule', '...'],
    ['trop long', 'a'.repeat(200)],
  ])('rejette : %s', (_, text) => {
    expect(parseBoard(text)).toBeNull();
  });
});
