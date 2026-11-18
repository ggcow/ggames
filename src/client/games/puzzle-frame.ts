// Cadre commun des jeux : le plateau, avec une pastille sur son bord (compteur de coups, vies…) pour ne pas lui
// prendre de hauteur sur un téléphone, puis une rangée de boutons (Recommencer, Annuler…). Le jeu choisit sa
// pastille et ses boutons, remplit le plateau et les tient à jour.

import { h, replaceChildren } from '../platform/dom.ts';

export interface PuzzleFrameOptions {
  /** Pastille posée sur le bord du plateau (compteur de coups, vies) ; facultative. */
  badge?: HTMLElement;
  /** Boutons sous le plateau, de gauche à droite. */
  buttons: readonly HTMLButtonElement[];
}

/** Pastille du bord du plateau, que le jeu met à jour et confie au cadre. */
export const frameBadge = (): HTMLElement => h('span', { class: 'counter' });

/** Pastille des vies d'un jeu qui pardonne quelques erreurs : remplie par `livesText`. */
export const livesBadge = (): HTMLElement => h('span', { class: 'counter lives' });

/** Vies d'un joueur sur `lives`, en cœurs : pleins pour celles qui restent, noirs pour celles perdues. */
export function livesText(misses: number, lives: number): string {
  const left = Math.max(0, lives - misses);
  return '❤️'.repeat(left) + '🖤'.repeat(lives - left);
}

/** Bouton de la rangée sous le plateau. */
export const frameButton = (label: string, onClick: () => void): HTMLButtonElement =>
  h('button', { class: 'btn', on: { click: onClick } }, label);

/** Place le cadre dans `host` et renvoie l'emplacement du plateau. */
export function mountPuzzleFrame(host: HTMLElement, options: PuzzleFrameOptions): HTMLElement {
  const table = h('div', { class: 'board-host' });
  replaceChildren(
    host,
    h('div', { class: 'table' }, options.badge ?? null, table),
    h('div', { class: 'controls' }, ...options.buttons),
  );
  return table;
}
