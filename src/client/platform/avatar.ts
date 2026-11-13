// Pastille ronde avec l'initiale d'un joueur, d'une couleur stable dérivée de son identifiant.

import { h } from './dom.ts';

const AVATAR_COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#9775fa', '#f783ac'] as const;

/** Couleur d'un joueur : toujours la même pour un même identifiant. */
export function avatarColor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] ?? AVATAR_COLORS[0];
}

/** Première lettre du pseudo (gère les caractères chinois et les emojis). */
export const initial = (name: string): string => ([...name.trim()][0] ?? '?').toUpperCase();

export function avatar(id: string, name: string, size: 'xs' | 'sm' | 'md' = 'sm'): HTMLElement {
  return h(
    'span',
    { class: `avatar ${size}`, style: { background: avatarColor(id) }, attrs: { title: name } },
    initial(name),
  );
}
