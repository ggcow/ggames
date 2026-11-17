import { describe, expect, it } from 'vitest';
import {
  type Board,
  boardToString,
  cellsOf,
  isSolved,
  occupancy,
  parseBoard,
  positionKey,
  possibleSlides,
  shortestSolution,
  slide,
  slideRange,
} from '../../src/shared/games/parking/rules.ts';

/** Parking écrit rangée par rangée, pour la lisibilité des tests. */
const lot = (...rows: string[]): string => rows.join('');

const board = (...rows: string[]): Board => {
  const parsed = parseBoard(lot(...rows));
  if (!parsed) throw new Error('parking invalide');
  return parsed;
};

// La voiture rouge en tête de sa rangée ; un véhicule vertical `b` lui barre la route.
const BLOCKED = board('......', '......', 'aa.b..', '...b..', '......', '......');

describe('encodage', () => {
  it('lit un parking et le réécrit à l’identique', () => {
    const text = lot('..ccc.', '...d..', 'aa.d..', 'b.....', 'b..eee', '......');
    const parsed = parseBoard(text);
    expect(parsed).toEqual([
      { horizontal: true, length: 2, row: 2, col: 0 },
      { horizontal: false, length: 2, row: 3, col: 0 },
      { horizontal: true, length: 3, row: 0, col: 2 },
      { horizontal: false, length: 2, row: 1, col: 3 },
      { horizontal: true, length: 3, row: 4, col: 3 },
    ]);
    expect(parsed && boardToString(parsed)).toBe(text);
  });

  it('refuse un texte de mauvaise longueur ou un caractère inconnu', () => {
    expect(parseBoard(lot('......', '......', 'aa....', '......', '......', '.....'))).toBeNull();
    expect(parseBoard(lot('......', '......', 'aa....', '......', '......', '.....z'))).toBeNull();
  });

  it('refuse des lettres qui sautent un véhicule', () => {
    expect(parseBoard(lot('......', '......', 'aa....', '......', 'cc....', '......'))).toBeNull();
  });

  it('refuse un véhicule tordu, d’une case, trop long ou à cheval sur deux rangées', () => {
    expect(parseBoard(lot('bb....', '.b....', 'aa....', '......', '......', '......'))).toBeNull();
    expect(parseBoard(lot('b.....', '......', 'aa....', '......', '......', '......'))).toBeNull();
    expect(parseBoard(lot('bbbb..', '......', 'aa....', '......', '......', '......'))).toBeNull();
    expect(parseBoard(lot('.....b', 'b.....', 'aa....', '......', '......', '......'))).toBeNull();
    expect(parseBoard(lot('b.b...', '......', 'aa....', '......', '......', '......'))).toBeNull();
  });

  it('exige une voiture rouge horizontale de deux cases sur la rangée de la sortie', () => {
    expect(parseBoard(lot('......', '......', '......', '......', '......', '......'))).toBeNull();
    expect(parseBoard(lot('......', 'aa....', '......', '......', '......', '......'))).toBeNull();
    expect(parseBoard(lot('......', '......', 'aaa...', '......', '......', '......'))).toBeNull();
    expect(parseBoard(lot('......', 'a.....', 'a.....', '......', '......', '......'))).toBeNull();
  });
});

describe('glissements', () => {
  it('donne les cases et l’occupation de chaque véhicule', () => {
    expect(cellsOf({ horizontal: false, length: 3, row: 1, col: 4 })).toEqual([10, 16, 22]);
    const cells = occupancy(BLOCKED);
    expect([cells[12], cells[13], cells[14], cells[15], cells[21]]).toEqual([0, 0, -1, 1, 1]);
  });

  it('arrête un véhicule contre un autre ou contre le mur', () => {
    expect(slideRange(BLOCKED, 0)).toEqual({ min: 0, max: 1 });
    expect(slideRange(BLOCKED, 1)).toEqual({ min: -2, max: 2 });
    expect(slideRange(BLOCKED, 5)).toEqual({ min: 0, max: 0 });
  });

  it('fait glisser un véhicule de plusieurs cases en un coup, sans toucher au parking de départ', () => {
    const after = slide(BLOCKED, { vehicle: 1, delta: -2 });
    expect(after && boardToString(after)).toBe(lot('...b..', '...b..', 'aa....', '......', '......', '......'));
    expect(boardToString(BLOCKED)).toBe(lot('......', '......', 'aa.b..', '...b..', '......', '......'));
  });

  it('refuse un glissement nul, fractionnaire, trop long ou d’un véhicule inconnu', () => {
    expect(slide(BLOCKED, { vehicle: 1, delta: 0 })).toBeNull();
    expect(slide(BLOCKED, { vehicle: 1, delta: 0.5 })).toBeNull();
    expect(slide(BLOCKED, { vehicle: 0, delta: 2 })).toBeNull();
    expect(slide(BLOCKED, { vehicle: 1, delta: 3 })).toBeNull();
    expect(slide(BLOCKED, { vehicle: 7, delta: 1 })).toBeNull();
  });

  it('liste tous les coups possibles', () => {
    expect(possibleSlides(BLOCKED)).toEqual([
      { vehicle: 0, delta: 1 },
      { vehicle: 1, delta: -2 },
      { vehicle: 1, delta: -1 },
      { vehicle: 1, delta: 1 },
      { vehicle: 1, delta: 2 },
    ]);
  });

  it('gagne quand la voiture rouge touche la sortie', () => {
    expect(isSolved(BLOCKED)).toBe(false);
    expect(isSolved(board('......', '......', '....aa', '......', '......', '......'))).toBe(true);
  });

  it('identifie une position par la tête de chaque véhicule', () => {
    const moved = slide(BLOCKED, { vehicle: 1, delta: 1 });
    expect(positionKey(BLOCKED)).not.toBe(moved && positionKey(moved));
    expect(moved && positionKey(moved)).toBe(String.fromCharCode(12, 21));
  });
});

describe('solution la plus courte', () => {
  it('compte un glissement de plusieurs cases pour un seul coup', () => {
    const result = shortestSolution(BLOCKED, 1000);
    expect(result).toEqual({
      kind: 'solved',
      slides: [
        { vehicle: 1, delta: -2 },
        { vehicle: 0, delta: 4 },
      ],
    });
  });

  it('ne joue rien sur un parking déjà gagné', () => {
    expect(shortestSolution(board('......', '......', '....aa', '......', '......', '......'), 10)).toEqual({
      kind: 'solved',
      slides: [],
    });
  });

  it('prouve qu’une sortie barrée par un véhicule horizontal est impossible', () => {
    expect(shortestSolution(board('......', '......', 'aa..bb', '......', '......', '......'), 1000).kind).toBe(
      'impossible',
    );
  });

  it('abandonne au-delà de la limite de positions ou de coups', () => {
    expect(shortestSolution(BLOCKED, 1).kind).toBe('too-long');
    expect(shortestSolution(BLOCKED, 1000, 1).kind).toBe('too-long');
    expect(shortestSolution(BLOCKED, 1000, 2).kind).toBe('solved');
  });
});
