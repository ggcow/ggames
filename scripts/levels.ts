// Écrit les niveaux enregistrés de la campagne d'un jeu : `npm run levels -- <jeu>`.
// Ne sert qu'à créer les niveaux d'un nouveau jeu : regénérer ceux d'un jeu déjà publié changerait des niveaux
// joués et invaliderait les parties enregistrées.

import { writeFileSync } from 'node:fs';
import { generateLevels as bouquets } from '../src/shared/games/bouquets/generate.ts';
import { MAX_LEVEL } from '../src/shared/games/campaign.ts';
import { generateLevels as couteaux } from '../src/shared/games/couteaux/generate.ts';
import { LEVEL_COUNT as COUTEAUX_LEVELS } from '../src/shared/games/couteaux/rules.ts';
import { generateLevels as fioles } from '../src/shared/games/fioles/generate.ts';
import { generateLevels as pandas } from '../src/shared/games/pandas/generate.ts';
import { LEVEL_COUNT as PANDAS_LEVELS } from '../src/shared/games/pandas/rules.ts';
import { generateLevels as parking } from '../src/shared/games/parking/generate.ts';

/**
 * Générateur de chaque jeu : les niveaux 1 à `count`, encodés comme le jeu les relit. `progress` reçoit le
 * numéro de chaque niveau terminé (la génération peut prendre longtemps).
 */
type Generate = (count: number, progress: (level: number) => void) => string[];

/** Générateur et nombre de niveaux de la campagne de chaque jeu. */
const GENERATORS: Record<string, { generate: Generate; count: number }> = {
  fioles: { generate: fioles, count: MAX_LEVEL },
  bouquets: { generate: bouquets, count: MAX_LEVEL },
  pandas: { generate: pandas, count: PANDAS_LEVELS },
  parking: { generate: parking, count: MAX_LEVEL },
  couteaux: { generate: couteaux, count: COUTEAUX_LEVELS },
};

const game = process.argv[2] ?? '';
const generator = GENERATORS[game];
if (!generator) {
  process.stderr.write(`Usage : npm run levels -- <${Object.keys(GENERATORS).join('|')}>\n`);
  process.exit(1);
}

const started = Date.now();
const { generate, count } = generator;
const levels = generate(count, (level) =>
  process.stdout.write(`niveau ${level}/${count} (${Math.round((Date.now() - started) / 1000)} s)\n`),
);
const file = `src/shared/games/${game}/levels.ts`;
writeFileSync(
  file,
  `// Niveaux 1 à ${count} de la campagne, enregistrés une fois pour toutes par \`npm run levels -- ${game}\`.
// Ne pas modifier ni regénérer : les parties enregistrées sont rejouées sur ces plateaux.

export const LEVELS: readonly string[] = [
${levels.map((level) => `  '${level}',`).join('\n')}
];
`,
);
process.stdout.write(`${levels.length} niveaux écrits dans ${file}\n`);
