// Cadre commun des jeux de réflexion au tour par tour : le plateau, avec le compteur de coups en pastille sur
// son bord pour ne pas lui prendre de hauteur sur un téléphone, puis les boutons Annuler et Recommencer.
// Le jeu remplit `table` et met à jour le compteur et l'état des boutons.

import { h, replaceChildren } from '../platform/dom.ts';

export interface PuzzleFrame {
  counter: HTMLElement;
  table: HTMLElement;
  undo: HTMLButtonElement;
  restart: HTMLButtonElement;
}

export interface PuzzleFrameOptions {
  undoLabel: string;
  restartLabel: string;
  onUndo: () => void;
  onRestart: () => void;
}

export function mountPuzzleFrame(host: HTMLElement, options: PuzzleFrameOptions): PuzzleFrame {
  const frame: PuzzleFrame = {
    counter: h('span', { class: 'counter' }),
    table: h('div', { class: 'board-host' }),
    undo: h('button', { class: 'btn', on: { click: options.onUndo } }, options.undoLabel),
    restart: h('button', { class: 'btn', on: { click: options.onRestart } }, options.restartLabel),
  };
  replaceChildren(
    host,
    h('div', { class: 'table' }, frame.counter, frame.table),
    h('div', { class: 'controls' }, frame.undo, frame.restart),
  );
  return frame;
}
