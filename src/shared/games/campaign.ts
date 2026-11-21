// Campagne de niveaux numérotés, commune aux jeux qui en ont une : clés `c:<niveau>` de 1 au nombre de niveaux
// du jeu (`size`, MAX_LEVEL par défaut).
// Progression individuelle : on rejoue tout niveau gagné, et on joue le premier niveau pas encore gagné ou, pour un
// jeu qui le permet, les premiers (`open`).

/**
 * Nombre de niveaux d'une campagne, sauf pour un jeu qui en déclare moins : cinq pages de la grille, enregistrés
 * dans chaque jeu (`levels.ts`).
 */
export const MAX_LEVEL = 100;

/** Clé d'un niveau de la campagne. */
export const campaignKey = (level: number): string => `c:${level}`;

/**
 * Numéro du niveau désigné par une clé, ou `null` si la clé n'est pas un niveau d'une campagne de `size`
 * niveaux.
 */
export function parseCampaignKey(key: string, size = MAX_LEVEL): number | null {
  const match = /^c:([1-9]\d{0,2})$/.exec(key);
  const level = match?.[1] ? Number(match[1]) : null;
  return level !== null && level <= size ? level : null;
}

/**
 * Ordre d'affichage des clés : niveaux de la campagne par numéro croissant, puis les autres clés par ordre
 * alphabétique, pour qu'une liste reste la même d'un chargement à l'autre.
 */
export function campaignCompareKeys(a: string, b: string): number {
  const levelA = parseCampaignKey(a);
  const levelB = parseCampaignKey(b);
  if (levelA !== null && levelB !== null) return levelA - levelB;
  if (levelA !== null) return -1;
  if (levelB !== null) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Niveau à jouer d'un joueur : le premier qu'il n'a pas gagné en partant du niveau 1. Un niveau gagné plus loin
 * (en rejoignant un ami) ne fait pas avancer cette progression.
 */
export function campaignFrontier(won: ReadonlySet<string>, size = MAX_LEVEL): number {
  let level = 1;
  while (level < size && won.has(campaignKey(level))) level++;
  return level;
}

/**
 * Vrai si `key` est un niveau que la progression du joueur a atteint : un niveau gagné, ou l'un des `open` premiers
 * niveaux qu'il n'a pas encore gagnés. Un niveau gagné plus loin (en rejoignant un ami) n'en ouvre pas d'autre.
 */
export function campaignIsUnlocked(key: string, won: ReadonlySet<string>, size = MAX_LEVEL, open = 1): boolean {
  const level = parseCampaignKey(key, size);
  if (level === null) return false;
  if (won.has(key)) return true;
  let unwon = 0;
  for (let before = 1; before <= level; before++) if (!won.has(campaignKey(before))) unwon++;
  return unwon <= open;
}
