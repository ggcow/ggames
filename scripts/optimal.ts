// Écrit le meilleur score possible de chaque niveau d'un jeu : `npm run optimal -- <jeu>`.
// Calculé une fois pour toutes par la recherche exhaustive du jeu, à partir de ses niveaux enregistrés ;
// le relancer redonne les mêmes valeurs.

import { writeFileSync } from 'node:fs';
import { minimalMoves } from '../src/shared/games/fioles/generate.ts';
import { LEVELS as FIOLES_LEVELS } from '../src/shared/games/fioles/levels.ts';
import { parseBoard } from '../src/shared/games/fioles/rules.ts';
import { LEVELS as PARKING_LEVELS } from '../src/shared/games/parking/levels.ts';
import { parseBoard as parseParking, shortestSolution } from '../src/shared/games/parking/rules.ts';

/** Positions explorées au plus pour un niveau : au-delà, la recherche s'arrête en erreur. */
const LIMIT = 5_000_000;

/** Recherche de chaque jeu : meilleur score possible du niveau encodé, ou `null` si elle échoue. */
const SOLVERS: Record<string, { levels: readonly string[]; best: (level: string) => number | null }> = {
  fioles: {
    levels: FIOLES_LEVELS,
    best: (level) => {
      const board = parseBoard(level);
      return board ? minimalMoves(board, LIMIT) : null;
    },
  },
  parking: {
    levels: PARKING_LEVELS,
    best: (level) => {
      const board = parseParking(level);
      const result = board ? shortestSolution(board, LIMIT) : null;
      return result?.kind === 'solved' ? result.slides.length : null;
    },
  },
};

const game = process.argv[2] ?? '';
const solver = SOLVERS[game];
if (!solver) {
  process.stderr.write(`Usage : npm run optimal -- <${Object.keys(SOLVERS).join('|')}>\n`);
  process.exit(1);
}

const values = solver.levels.map((level, index) => {
  const best = solver.best(level);
  if (best === null) throw new Error(`niveau ${index + 1} : meilleur score introuvable`);
  process.stdout.write(`niveau ${index + 1}/${solver.levels.length} : ${best}\n`);
  return best;
});
const file = `src/shared/games/${game}/optimal.ts`;
writeFileSync(
  file,
  `// Meilleur score possible de chaque niveau de la campagne (index 0 = niveau 1), calculé par une recherche
// exhaustive : \`npm run optimal -- ${game}\`.

export const OPTIMAL: readonly number[] = [${values.join(', ')}];
`,
);
process.stdout.write(`${values.length} valeurs écrites dans ${file}\n`);
