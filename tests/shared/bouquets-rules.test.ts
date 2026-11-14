import { describe, expect, it } from 'vitest';
import {
  applyMove,
  type Board,
  boardToString,
  canMove,
  cloneBoard,
  flowerCount,
  frontOf,
  hasMove,
  isPotEmpty,
  isSolved,
  liveState,
  MAX_LAYERS,
  MAX_POTS,
  parseBoard,
  parseLiveState,
} from '../../src/shared/games/bouquets/rules.ts';

const _ = null;

describe('déplacement', () => {
  it('pose la fleur à la place choisie et libère sa place de départ', () => {
    const board: Board = [[[0, 1, _]], [[_, _, 2]]];
    expect(applyMove(board, { from: 0, slot: 1, to: 1, place: 0 })).toEqual({ bouquet: false, revealed: [] });
    expect(board).toEqual([[[0, _, _]], [[1, _, 2]]]);
  });

  it.each([
    ['dans le même pot', { from: 0, slot: 0, to: 0, place: 2 }],
    ['depuis une place vide', { from: 0, slot: 2, to: 1, place: 0 }],
    ['vers une place occupée', { from: 0, slot: 0, to: 1, place: 2 }],
    ['vers une place hors du pot', { from: 0, slot: 0, to: 1, place: 3 }],
    ['depuis un pot inconnu', { from: 5, slot: 0, to: 1, place: 0 }],
    ['vers un pot inconnu', { from: 0, slot: 0, to: 5, place: 0 }],
  ])('refuse un coup %s sans toucher au plateau', (_label, move) => {
    const board: Board = [[[0, 1, _]], [[_, _, 2]]];
    const before = cloneBoard(board);
    expect(canMove(board, move)).toBe(false);
    expect(applyMove(board, move)).toBeNull();
    expect(board).toEqual(before);
  });

  it('forme un bouquet avec trois fleurs pareilles devant un pot', () => {
    const board: Board = [[[3, 1, _]], [[3, _, 3]]];
    expect(applyMove(board, { from: 0, slot: 0, to: 1, place: 1 })).toEqual({ bouquet: true, revealed: [] });
    expect(board).toEqual([[[_, 1, _]], [[_, _, _]]]);
  });

  it('fait avancer la couche suivante quand un bouquet vide le devant', () => {
    const board: Board = [
      [[3, 1, _]],
      [
        [3, 3, _],
        [4, 5, _],
        [6, 6, 6],
      ],
    ];
    expect(applyMove(board, { from: 0, slot: 0, to: 1, place: 2 })).toEqual({ bouquet: true, revealed: [1] });
    expect(board[1]).toEqual([
      [4, 5, _],
      [6, 6, 6],
    ]);
  });

  it('fait avancer la couche suivante quand le devant du pot de départ se vide', () => {
    const board: Board = [
      [
        [_, 2, _],
        [7, 8, 9],
      ],
      [[_, _, _]],
    ];
    expect(applyMove(board, { from: 0, slot: 1, to: 1, place: 0 })).toEqual({ bouquet: false, revealed: [0] });
    expect(board).toEqual([[[7, 8, 9]], [[2, _, _]]]);
  });

  it('laisse un pot vide sans couche cachée avec un devant vide', () => {
    const board: Board = [[[_, 2, _]], [[_, _, _]]];
    applyMove(board, { from: 0, slot: 1, to: 1, place: 0 });
    expect(isPotEmpty(board[0] ?? [])).toBe(true);
    expect(board[0]).toEqual([[_, _, _]]);
  });
});

describe('état du plateau', () => {
  it('est résolu quand tous les pots sont vides', () => {
    expect(isSolved([[[_, _, _]], [[_, _, _]]])).toBe(true);
    expect(isSolved([[[_, _, _]], [[_, 1, _]]])).toBe(false);
  });

  it('compte les fleurs, couches cachées comprises', () => {
    expect(
      flowerCount([
        [
          [0, _, 1],
          [2, 2, 2],
        ],
        [[_, _, _]],
      ]),
    ).toBe(5);
  });

  it('sait s’il reste un coup possible', () => {
    expect(hasMove([[[0, 1, 2]], [[3, 4, _]]])).toBe(true);
    expect(hasMove([[[0, 1, 2]], [[3, 4, 5]]])).toBe(false);
    expect(hasMove([[[0, _, _]], [[1, 2, 3]]])).toBe(true);
    // Des places libres, mais seulement dans le pot qui porte la seule fleur.
    expect(hasMove([[[0, _, _]]])).toBe(false);
  });

  it('donne le devant d’un pot', () => {
    expect(
      frontOf([
        [1, _, 2],
        [3, 3, 3],
      ]),
    ).toEqual([1, _, 2]);
    expect(frontOf([])).toEqual([]);
  });
});

describe('encodage texte', () => {
  const board: Board = [
    [
      [0, 1, _],
      [1, 0, 2],
    ],
    [[_, _, _]],
    [[2, 2, 1]],
    [[11, 11, 0]],
    [[11, _, _]],
  ];

  it('fait l’aller-retour', () => {
    expect(boardToString(board)).toBe('ab-/bac.---.ccb.lla.l--');
    expect(parseBoard('ab-/bac.---.ccb.lla.l--')).toEqual(board);
  });

  it.each([
    ['une espèce inconnue', 'abm.---'],
    ['une couche de deux places', 'ab.---'],
    ['une couche cachée vide', 'abc/---.abc.abc'],
    ['un devant vide devant une couche cachée', '---/abc.abc.abc'],
    ['une couche de trois fleurs pareilles', 'aaa'],
    ['une espèce qui n’est pas par trois', 'ab-.ab-.a--'],
    [
      'trop de couches',
      Array(MAX_LAYERS + 1)
        .fill('ab-')
        .join('/'),
    ],
    [
      'trop de pots',
      Array(MAX_POTS + 1)
        .fill('---')
        .join('.'),
    ],
  ])('rejette %s', (_label, text) => {
    expect(parseBoard(text)).toBeNull();
  });
});

describe('état en direct', () => {
  const board: Board = [
    [
      [0, 1, _],
      [2, 2, 2],
      [3, 3, 3],
    ],
    [[_, _, _]],
    [[11, _, 4]],
  ];

  it('décrit le devant et les couches cachées de chaque pot', () => {
    expect(liveState(board)).toBe('ab-2.---0.l-e0');
  });

  it('relit un état valide', () => {
    expect(parseLiveState('ab-2.---0.l-e0')).toEqual([
      { front: [0, 1, _], hidden: 2 },
      { front: [_, _, _], hidden: 0 },
      { front: [11, _, 4], hidden: 0 },
    ]);
  });

  it.each([
    ['une espèce inconnue', 'abm0'],
    ['un pot de deux places', 'ab0'],
    ['un pot sans compte de couches', 'abc'],
    ['trop de couches cachées', 'abc6'],
    ['un devant vide devant des couches cachées', '---1'],
    [
      'trop de pots',
      Array(MAX_POTS + 1)
        .fill('abc0')
        .join('.'),
    ],
    ['du texte quelconque', 'n’importe quoi'],
  ])('rejette %s', (_label, text) => {
    expect(parseLiveState(text)).toBeNull();
  });
});
