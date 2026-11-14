// Écrit les niveaux enregistrés de la campagne d'un jeu : `npm run levels -- <jeu>`.
// Ne sert qu'à créer les niveaux d'un nouveau jeu : regénérer ceux d'un jeu déjà publié changerait des niveaux
// joués et invaliderait les parties enregistrées.

import { writeFileSync } from 'node:fs';
import { MAX_LEVEL } from '../src/shared/games/campaign.ts';
import { generateLevels as fioles } from '../src/shared/games/fioles/generate.ts';

/** Générateur de chaque jeu : les niveaux 1 à `count`, encodés comme le jeu les relit. */
const GENERATORS: Record<string, (count: number) => string[]> = { fioles };

const game = process.argv[2] ?? '';
const generate = GENERATORS[game];
if (!generate) {
  process.stderr.write(`Usage : npm run levels -- <${Object.keys(GENERATORS).join('|')}>\n`);
  process.exit(1);
}

const levels = generate(MAX_LEVEL);
const file = `src/shared/games/${game}/levels.ts`;
writeFileSync(
  file,
  `// Niveaux 1 à ${MAX_LEVEL} de la campagne, enregistrés une fois pour toutes par \`npm run levels -- ${game}\`.
// Ne pas modifier ni regénérer : les parties enregistrées sont rejouées sur ces plateaux.

export const LEVELS: readonly string[] = [
${levels.map((level) => `  '${level}',`).join('\n')}
];
`,
);
process.stdout.write(`${levels.length} niveaux écrits dans ${file}\n`);
