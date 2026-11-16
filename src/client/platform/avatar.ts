// Pastille ronde d'un joueur : l'animal qu'il a choisi, sur une couleur stable dérivée de son identifiant.

import { type Avatar, derivedAvatar, hashId } from '../../shared/platform/avatars.ts';
import type { PlayerId, PlayerInfo } from '../../shared/platform/protocol.ts';
import { h, noTranslate } from './dom.ts';

const AVATAR_COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#9775fa', '#f783ac'] as const;

// Annuaire des animaux, par joueur. Une pastille s'affiche partout où un joueur apparaît (présence, salon,
// classements…), et ces données ne portent que son identifiant : l'application tient cet annuaire à jour
// à partir de la liste des joueurs, et chaque pastille le consulte.
const directory = new Map<PlayerId, Avatar>();

/** Remplace l'annuaire par la liste complète des joueurs. */
export function setAvatars(players: readonly PlayerInfo[]): void {
  directory.clear();
  for (const player of players) if (player.avatar) directory.set(player.id, player.avatar);
}

/** Met à jour l'animal d'un seul joueur, par exemple juste après l'avoir changé. */
export function setAvatar(player: PlayerId, avatar: Avatar | null): void {
  if (avatar) directory.set(player, avatar);
  else directory.delete(player);
}

/** Animaux portés par les autres joueurs que `me`. */
export function takenAvatars(me: PlayerId): Set<Avatar> {
  return new Set([...directory].filter(([player]) => player !== me).map(([, avatar]) => avatar));
}

/** Animal d'un joueur ; tiré de son identifiant tant que l'annuaire ne le connaît pas. */
export const avatarOf = (id: PlayerId): Avatar => directory.get(id) ?? derivedAvatar(id);

/** Couleur d'un joueur : toujours la même pour un même identifiant. */
export function avatarColor(id: string): string {
  return AVATAR_COLORS[hashId(id) % AVATAR_COLORS.length] ?? AVATAR_COLORS[0];
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
      avatarOf(id),
    ),
  );
}
