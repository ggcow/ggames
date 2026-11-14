// Campagne de niveaux numérotés, commune aux jeux qui en ont une : clés `c:<niveau>` de 1 à MAX_LEVEL.
// Progression individuelle : on joue le premier niveau pas encore gagné et tous ceux d'avant.

/** Nombre de niveaux d'une campagne : cinq pages de la grille, enregistrés dans chaque jeu (`levels.ts`). */
export const MAX_LEVEL = 100;

/** Clé d'un niveau de la campagne. */
export const campaignKey = (level: number): string => `c:${level}`;

/** Numéro du niveau désigné par une clé, ou `null` si la clé n'est pas un niveau de campagne valide. */
export function parseCampaignKey(key: string): number | null {
  const match = /^c:([1-9]\d{0,2})$/.exec(key);
  const level = match?.[1] ? Number(match[1]) : null;
  return level !== null && level <= MAX_LEVEL ? level : null;
}

/**
 * Niveau à jouer d'un joueur : le premier qu'il n'a pas gagné en partant du niveau 1. Un niveau gagné plus loin
 * (en rejoignant un ami) ne fait pas avancer cette progression.
 */
export function campaignFrontier(won: ReadonlySet<string>): number {
  let level = 1;
  while (level < MAX_LEVEL && won.has(campaignKey(level))) level++;
  return level;
}

/** Vrai si `key` est un niveau que la progression du joueur a atteint. */
export function campaignIsUnlocked(key: string, won: ReadonlySet<string>): boolean {
  const level = parseCampaignKey(key);
  if (level === null) return false;
  for (let previous = 1; previous < level; previous++) if (!won.has(campaignKey(previous))) return false;
  return true;
}
