// Pastille ronde d'un joueur : l'animal qu'il a choisi, que personne d'autre n'a.

import { type Avatar, derivedAvatar } from '../../shared/platform/avatars.ts';
import type { PlayerId, PlayerInfo } from '../../shared/platform/protocol.ts';
import { h, noTranslate } from './dom.ts';

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

export function avatar(id: string, name: string, size: 'xs' | 'sm' | 'md' | 'lg' = 'sm'): HTMLElement {
  return noTranslate(
    h('span', { class: `avatar ${size}`, attrs: { title: name, role: 'img', 'aria-label': name } }, avatarOf(id)),
  );
}

/**
 * Petites pastilles d'un groupe de joueurs (ex æquo, joueurs posés sur une case) : les `max` premiers, puis un
 * compteur « +n » pour les autres, pour garder la même place quel que soit le nombre de joueurs.
 */
export function avatarGroup<T>(items: readonly T[], max: number, render: (item: T) => HTMLElement): HTMLElement[] {
  const extra = items.length - max;
  return [
    ...items.slice(0, max).map(render),
    ...(extra > 0 ? [noTranslate(h('span', { class: 'avatar xs more' }, `+${extra}`))] : []),
  ];
}
