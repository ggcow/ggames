import { describe, expect, it } from 'vitest';
import { MAX_LEVEL } from '../../src/shared/games/campaign.ts';
import {
  campaignMoves,
  EASIEST_MOVES,
  exploreComponent,
  generateBoard,
  generateLevel,
  generateLevels,
  HARDEST_MOVES,
  mutate,
  randomBoard,
} from '../../src/shared/games/parking/generate.ts';
import { LEVELS } from '../../src/shared/games/parking/levels.ts';
import { OPTIMAL } from '../../src/shared/games/parking/optimal.ts';
import {
  type Board,
  boardToString,
  cellsOf,
  EXIT_ROW,
  isSolved,
  parseBoard,
  RED,
  shortestSolution,
} from '../../src/shared/games/parking/rules.ts';
import { createRandom } from '../../src/shared/games/random.ts';

const board = (text: string): Board => {
  const parsed = parseBoard(text);
  if (!parsed) throw new Error('parking invalide');
  return parsed;
};

describe('campagne', () => {
  it('allonge la solution de EASIEST_MOVES à HARDEST_MOVES coups', () => {
    const moves = Array.from({ length: MAX_LEVEL }, (_, i) => campaignMoves(i + 1));
    expect(moves[0]).toBe(EASIEST_MOVES);
    expect(moves[MAX_LEVEL - 1]).toBe(HARDEST_MOVES);
    moves.slice(1).forEach((count, i) => {
      expect(count - (moves[i] ?? 0)).toBeGreaterThanOrEqual(0);
      expect(count - (moves[i] ?? 0)).toBeLessThanOrEqual(1);
    });
  });

  it('enregistre pour chaque niveau la difficulté de la campagne', () => {
    expect(OPTIMAL).toHaveLength(MAX_LEVEL);
    expect(OPTIMAL).toEqual(OPTIMAL.map((_, index) => campaignMoves(index + 1)));
  });

  it('reproduit les niveaux enregistrés', () => {
    expect(generateLevels(3, () => undefined)).toEqual(LEVELS.slice(0, 3));
    expect(boardToString(generateLevel(40))).toBe(LEVELS[39]);
  });
});

describe('tirage', () => {
  it('place les véhicules sans chevauchement, aucun horizontal sur la rangée de la sortie', () => {
    const random = createRandom(7);
    for (let i = 0; i < 50; i++) {
      const drawn = randomBoard(12, random);
      const cells = drawn.flatMap(cellsOf);
      expect(new Set(cells).size).toBe(cells.length);
      expect(drawn.length).toBeLessThanOrEqual(13);
      expect(drawn[RED]).toMatchObject({ horizontal: true, row: EXIT_ROW });
      expect(drawn.slice(1).some((v) => v.horizontal && v.row === EXIT_ROW)).toBe(false);
      expect(parseBoard(boardToString(drawn))).toEqual(drawn);
    }
  });

  it('retouche, ajoute ou retire un véhicule sans chevauchement, la voiture rouge en place', () => {
    const random = createRandom(11);
    let current = randomBoard(8, random);
    for (let i = 0; i < 300; i++) {
      const variant = mutate(current, random);
      if (!variant) continue;
      const cells = variant.flatMap(cellsOf);
      expect(new Set(cells).size).toBe(cells.length);
      expect(cells.every((cell) => cell >= 0 && cell < 36)).toBe(true);
      expect(variant[RED]).toEqual(current[RED]);
      expect(variant.slice(1).some((v) => v.horizontal && v.row === EXIT_ROW)).toBe(false);
      expect(Math.abs(variant.length - current.length)).toBeLessThanOrEqual(1);
      expect(parseBoard(boardToString(variant))).toEqual(variant);
      current = variant;
    }
  });
});

describe('recherche', () => {
  it('choisit un parking dont la solution la plus courte a juste le nombre de coups voulu', () => {
    const chosen = generateBoard(12, 3);
    expect(generateBoard(12, 3)).toEqual(chosen);
    const result = shortestSolution(chosen, 100_000);
    expect(result.kind === 'solved' && result.slides.length).toBe(12);
  });

  it('écarte les parkings déjà retenus', () => {
    const first = boardToString(generateBoard(8, 3));
    expect(boardToString(generateBoard(8, 3, new Set([first])))).not.toBe(first);
  });

  it('échoue quand aucune escalade n’atteint la difficulté voulue', () => {
    expect(() => generateBoard(60, 1, new Set(), 2, 5)).toThrow(/60 coups après 2 escalades/);
  });
});

describe('composante', () => {
  // La voiture rouge et un véhicule vertical qui lui barre la route.
  const BLOCKED = board(`${'......'.repeat(2)}aa.b.....b..${'......'.repeat(2)}`);

  it('range chaque position par son nombre de coups jusqu’à la sortie', () => {
    const component = exploreComponent(BLOCKED, 1000);
    expect(component?.depth).toBe(2);
    expect(component?.at(0).every(isSolved)).toBe(true);
    expect(component?.at(2).map(boardToString)).toContain(boardToString(BLOCKED));
    expect(component?.at(9)).toEqual([]);
    const total = [0, 1, 2].reduce((sum, distance) => sum + (component?.at(distance).length ?? 0), 0);
    expect(total).toBe(component?.size);
  });

  it('renonce à une composante trop grande ou sans sortie', () => {
    expect(exploreComponent(BLOCKED, 3)).toBeNull();
    expect(exploreComponent(board(`${'......'.repeat(2)}aa..bb${'......'.repeat(3)}`), 1000)).toBeNull();
  });
});
