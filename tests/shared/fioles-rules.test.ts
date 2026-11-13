import { describe, expect, it } from 'vitest';
import {
  type Board,
  boardToString,
  CAP,
  canPour,
  createRandom,
  generateBoard,
  isSolvable,
  isSolved,
  isTubeDone,
  parseBoard,
  pour,
} from '../../src/shared/games/fioles/rules.ts';

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

  it('génère un plateau valide, faisable et déterministe', () => {
    const board = generateBoard(6, 2, 99);
    expect(board).toHaveLength(8);
    expect(board.slice(6)).toEqual([[], []]);
    expect(board.flat()).toHaveLength(6 * CAP);
    expect(isSolved(board)).toBe(false);
    expect(isSolvable(board, 500_000)).toBe(true);
    expect(generateBoard(6, 2, 99)).toEqual(board);
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
