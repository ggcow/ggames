// Cadre commun des jeux de réflexion au tour par tour : le plateau, avec le compteur de coups en pastille sur
// son bord pour ne pas lui prendre de hauteur sur un téléphone, puis une rangée de boutons (Recommencer,
// Annuler…). Le jeu choisit son compteur et ses boutons, remplit le plateau et les tient à jour.

import { h, replaceChildren } from '../platform/dom.ts';

export interface PuzzleFrameOptions {
  /** Compteur de coups posé sur le bord du plateau ; absent pour un jeu sans score. */
  counter?: HTMLElement;
  /** Boutons sous le plateau, de gauche à droite. */
  buttons: readonly HTMLButtonElement[];
}

/** Pastille du compteur de coups, que le jeu met à jour et confie au cadre. */
export const moveCounter = (): HTMLElement => h('span', { class: 'counter' });

/** Bouton de la rangée sous le plateau. */
export const frameButton = (label: string, onClick: () => void): HTMLButtonElement =>
  h('button', { class: 'btn', on: { click: onClick } }, label);

/** Place le cadre dans `host` et renvoie l'emplacement du plateau. */
export function mountPuzzleFrame(host: HTMLElement, options: PuzzleFrameOptions): HTMLElement {
  const table = h('div', { class: 'board-host' });
  replaceChildren(
    host,
    h('div', { class: 'table' }, options.counter ?? null, table),
    h('div', { class: 'controls' }, ...options.buttons),
  );
  return table;
}
