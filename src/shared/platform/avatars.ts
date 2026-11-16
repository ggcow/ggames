// Avatars des joueurs : chaque joueur a un animal du catalogue, que personne d'autre n'a. Il en reçoit un
// à l'inscription et peut le changer pour un animal encore libre.

// Emojis présents depuis longtemps sur iOS 15 et Android, pour qu'aucun appareil n'affiche un carré vide.
// L'ordre compte : il fixe l'animal proposé par défaut à un nouveau joueur.
export const AVATARS = [
  '🐶',
  '🐱',
  '🐭',
  '🐹',
  '🐰',
  '🦊',
  '🐻',
  '🐼',
  '🐨',
  '🐯',
  '🦁',
  '🐮',
  '🐷',
  '🐸',
  '🐵',
  '🐔',
  '🐧',
  '🐤',
  '🦆',
  '🦉',
  '🐺',
  '🐴',
  '🦄',
  '🐝',
  '🦋',
  '🐢',
  '🐙',
  '🦀',
  '🐠',
  '🐬',
  '🐳',
  '🦒',
  '🐗',
  '🐊',
  '🐍',
  '🦖',
  '🦕',
  '🐋',
  '🦈',
  '🦓',
  '🦍',
  '🐘',
  '🦏',
  '🐪',
  '🦘',
  '🦔',
  '🦇',
  '🐞',
] as const;

export type Avatar = (typeof AVATARS)[number];

const CATALOG: ReadonlySet<string> = new Set(AVATARS);

export const isAvatar = (value: unknown): value is Avatar => typeof value === 'string' && CATALOG.has(value);

/** Nombre stable tiré d'un identifiant de joueur. */
export function hashId(id: string): number {
  let value = 0;
  for (const char of id) value = (value * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(value);
}

/** Animal tiré de l'identifiant : celui proposé d'abord à un nouveau joueur. */
export const derivedAvatar = (id: string): Avatar => AVATARS[hashId(id) % AVATARS.length] ?? AVATARS[0];

/**
 * Animal attribué à un joueur : celui tiré de son identifiant s'il est libre, sinon le premier libre du
 * catalogue. `null` quand tous sont pris.
 */
export function pickAvatar(id: string, taken: ReadonlySet<string>): Avatar | null {
  const preferred = derivedAvatar(id);
  if (!taken.has(preferred)) return preferred;
  return AVATARS.find((avatar) => !taken.has(avatar)) ?? null;
}
