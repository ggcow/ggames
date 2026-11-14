// Affichage des fioles. Aucun état : on redessine tout le plateau à chaque changement.

import { COLORS, isTubeDone, type ReadonlyBoard } from '../../../shared/games/fioles/rules.ts';
import { h, replaceChildren } from '../../platform/dom.ts';

export interface BoardOptions {
  /** Fiole sélectionnée (soulevée). */
  selected?: number;
  /** Boules arrivant dans une fiole, pour l'animation de remplissage. */
  arrived?: { tube: number; count: number };
  onTap?: (tube: number, element: HTMLElement) => void;
  /** Largeur disponible en pixels. */
  width: number;
  /** Largeur minimale d'une fiole : assez large pour le doigt sur un plateau jouable. */
  minTube?: number;
  /** Nombre de rangées imposé ; par défaut une jusqu'à 6 fioles, deux au-delà. */
  rows?: number;
}

/** Largeur minimale d'une fiole touchable. */
export const MIN_TUBE = 24;

/** Largeur d'un aperçu : deux aperçus tiennent côte à côte sur un écran de 375 px. */
export const MINI_WIDTH = 150;

/** Largeur d'une fiole selon le nombre de fioles par rangée et la place disponible. */
export function tubeWidth(perRow: number, available: number, min = MIN_TUBE): number {
  return Math.max(min, Math.min(56, Math.floor(available / (perRow * 1.3))));
}

export function renderBoard(host: HTMLElement, board: ReadonlyBoard, options: BoardOptions): void {
  const rows = options.rows ?? (board.length <= 6 ? 1 : 2);
  const perRow = Math.ceil(board.length / rows);
  const width = tubeWidth(perRow, options.width, options.minTube);
  const element = h('div', { class: 'board', style: { '--tw': `${width}px` } });
  for (let row = 0; row < rows; row++) {
    const line = h('div', { class: 'board-row' });
    for (let index = row * perRow; index < Math.min(board.length, (row + 1) * perRow); index++) {
      line.append(renderTube(board[index] ?? [], index, options));
    }
    element.append(line);
  }
  replaceChildren(host, element);
}

function renderTube(tube: readonly number[], index: number, options: BoardOptions): HTMLElement {
  const classes = ['tube'];
  if (options.selected === index) classes.push('selected');
  const arrived = options.arrived?.tube === index;
  if (isTubeDone(tube)) classes.push('done');
  // Le bouchon ne s'anime que sur la fiole qui vient d'être terminée, pas à chaque redessin du plateau.
  if (arrived && isTubeDone(tube)) classes.push('sealed');
  const arrivedFrom = arrived ? tube.length - (options.arrived?.count ?? 0) : Number.POSITIVE_INFINITY;
  const glass = h(
    'div',
    { class: 'glass' },
    ...tube.map((color, position) =>
      h('div', {
        class: position >= arrivedFrom ? 'ball fill' : 'ball',
        style: { background: COLORS[color] ?? '#000' },
      }),
    ),
  );
  const element = h('div', { class: classes.join(' ') }, glass);
  const { onTap } = options;
  if (onTap) element.addEventListener('click', () => onTap(index, element));
  return element;
}

/**
 * Petit plateau non interactif (aperçu en direct d'un autre joueur). Deux rangées au-delà de six fioles,
 * comme le plateau jouable, pour que les fioles restent lisibles.
 */
export function renderMiniBoard(board: ReadonlyBoard): HTMLElement {
  const host = h('div', { class: 'mini' });
  renderBoard(host, board, { width: MINI_WIDTH, minTube: 6, rows: board.length <= 6 ? 1 : 2 });
  return host;
}

export function shake(element: HTMLElement): void {
  element.classList.remove('shake');
  void element.offsetWidth;
  element.classList.add('shake');
}
