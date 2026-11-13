// Campagne de niveaux numérotés, commune aux jeux qui en ont une : clés `c:<niveau>` de 1 à MAX_LEVEL,
// chaque niveau se débloque en gagnant le précédent.

/** Nombre de niveaux d'une campagne. */
export const MAX_LEVEL = 9999;

/** Clé d'un niveau de la campagne. */
export const campaignKey = (level: number): string => `c:${level}`;

/** Numéro du niveau désigné par une clé, ou `null` si la clé n'est pas un niveau de campagne valide. */
export function parseCampaignKey(key: string): number | null {
  const match = /^c:([1-9]\d{0,3})$/.exec(key);
  return match?.[1] ? Number(match[1]) : null;
}

/** Clé à gagner pour débloquer `key` : le niveau précédent, ou `null` pour le premier niveau. */
export function campaignPrerequisite(key: string): string | null {
  const level = parseCampaignKey(key);
  return level !== null && level > 1 ? campaignKey(level - 1) : null;
}
