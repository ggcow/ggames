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
}

/** Largeur d'une fiole selon le nombre de fioles par rangée et la place disponible. */
export function tubeWidth(perRow: number, available: number): number {
  return Math.max(24, Math.min(56, Math.floor(available / (perRow * 1.3))));
}

export function renderBoard(host: HTMLElement, board: ReadonlyBoard, options: BoardOptions): void {
  const rows = board.length <= 6 ? 1 : 2;
  const perRow = Math.ceil(board.length / rows);
  const element = h('div', { class: 'board', style: { '--tw': `${tubeWidth(perRow, options.width)}px` } });
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
  if (isTubeDone(tube)) classes.push('done');
  const arrivedFrom = options.arrived?.tube === index ? tube.length - options.arrived.count : Number.POSITIVE_INFINITY;
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

/** Petit plateau non interactif (aperçu en direct d'un autre joueur). */
export function renderMiniBoard(board: ReadonlyBoard): HTMLElement {
  const host = h('div', { class: 'mini' });
  renderBoard(host, board, { width: Math.min(board.length * 18 * 1.3, 220) });
  return host;
}

export function shake(element: HTMLElement): void {
  element.classList.remove('shake');
  void element.offsetWidth;
  element.classList.add('shake');
}
