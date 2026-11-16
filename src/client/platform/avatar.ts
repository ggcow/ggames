// Pastille ronde d'un joueur : un animal et une couleur, tous deux stables et dérivés de son identifiant.

import { h, noTranslate } from './dom.ts';

const AVATAR_COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#9775fa', '#f783ac'] as const;

// Emojis présents depuis longtemps sur iOS 15 et Android, pour qu'aucun appareil n'affiche un carré vide.
const AVATAR_ANIMALS = [
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
] as const;

const hash = (id: string): number => {
  let value = 0;
  for (const char of id) value = (value * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(value);
};

/** Couleur d'un joueur : toujours la même pour un même identifiant. */
export function avatarColor(id: string): string {
  return AVATAR_COLORS[hash(id) % AVATAR_COLORS.length] ?? AVATAR_COLORS[0];
}

/** Animal d'un joueur, tiré indépendamment de sa couleur pour multiplier les combinaisons. */
export function avatarAnimal(id: string): string {
  return AVATAR_ANIMALS[Math.floor(hash(id) / AVATAR_COLORS.length) % AVATAR_ANIMALS.length] ?? AVATAR_ANIMALS[0];
}

export function avatar(id: string, name: string, size: 'xs' | 'sm' | 'md' | 'lg' = 'sm'): HTMLElement {
  return noTranslate(
    h(
      'span',
      {
        class: `avatar ${size}`,
        style: { background: avatarColor(id) },
        attrs: { title: name, role: 'img', 'aria-label': name },
      },
      avatarAnimal(id),
    ),
  );
}
