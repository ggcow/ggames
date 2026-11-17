import { describe, expect, it } from 'vitest';
import { MAX_LEVEL } from '../../src/shared/games/campaign.ts';
import {
  campaignSpec,
  exploreComponent,
  generateBoard,
  generateLevel,
  generateLevels,
  HARDEST_MOVES,
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
  it('allonge la solution de 2 à HARDEST_MOVES coups, dans un parking de plus en plus rempli', () => {
    const specs = Array.from({ length: MAX_LEVEL }, (_, i) => campaignSpec(i + 1));
    expect(specs[0]).toMatchObject({ vehicles: 5, moves: 2 });
    expect(specs[MAX_LEVEL - 1]).toMatchObject({ vehicles: 14, moves: HARDEST_MOVES });
    specs.slice(1).forEach((spec, i) => {
      expect(spec.moves).toBeGreaterThanOrEqual(specs[i]?.moves ?? 0);
      expect(spec.vehicles).toBeGreaterThanOrEqual(specs[i]?.vehicles ?? 0);
    });
  });

  it('enregistre pour chaque niveau la difficulté de la campagne', () => {
    expect(OPTIMAL).toEqual(OPTIMAL.map((_, index) => campaignSpec(index + 1).moves));
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
      const drawn = randomBoard({ vehicles: 12, trucks: 0.3, moves: 0 }, random);
      const cells = drawn.flatMap(cellsOf);
      expect(new Set(cells).size).toBe(cells.length);
      expect(drawn.length).toBeLessThanOrEqual(13);
      expect(drawn[RED]).toMatchObject({ horizontal: true, row: EXIT_ROW });
      expect(drawn.slice(1).some((v) => v.horizontal && v.row === EXIT_ROW)).toBe(false);
      expect(parseBoard(boardToString(drawn))).toEqual(drawn);
    }
  });

  it('choisit un parking dont la solution la plus courte a juste le nombre de coups voulu', () => {
    const spec = { vehicles: 8, trucks: 0.3, moves: 6 };
    const chosen = generateBoard(spec, 3);
    expect(generateBoard(spec, 3)).toEqual(chosen);
    const result = shortestSolution(chosen, 100_000);
    expect(result.kind === 'solved' && result.slides.length).toBe(6);
  });

  it('écarte les parkings déjà retenus', () => {
    const spec = { vehicles: 8, trucks: 0.3, moves: 6 };
    const first = boardToString(generateBoard(spec, 3));
    expect(boardToString(generateBoard(spec, 3, new Set([first])))).not.toBe(first);
  });

  it('échoue quand aucun tirage n’atteint la difficulté voulue', () => {
    expect(() => generateBoard({ vehicles: 3, trucks: 0, moves: 40 }, 1, new Set(), 5)).toThrow(/40 coups/);
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
