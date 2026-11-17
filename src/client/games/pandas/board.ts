// Affichage d'une grille de Pandas. Aucun état : on redessine toute la grille à chaque changement.

import { colOf, type Grid, type Pandas, rowOf } from '../../../shared/games/pandas/rules.ts';
import { h, replaceChildren } from '../../platform/dom.ts';
import type { PandasStrings } from './strings.ts';

/** Teinte de chaque bosquet : claires et distinctes, pour que le panda reste lisible dessus. */
export const REGION_COLORS = [
  '#b2f2bb',
  '#ffd8a8',
  '#a5d8ff',
  '#fcc2d7',
  '#d0bfff',
  '#ffec99',
  '#99e9f2',
  '#ffc9c9',
  '#c0eb75',
  '#dee2e6',
] as const;

/** Côté d'une case touchable au plus et au moins, en pixels. */
const MAX_CELL = 56;
export const MIN_CELL = 30;

/** Largeur d'un aperçu : deux aperçus tiennent côte à côte sur un écran de 375 px. */
export const MINI_WIDTH = 140;

export interface GridOptions {
  /** Largeur disponible en pixels. */
  width: number;
  /** Côté minimal d'une case : assez large pour le doigt sur une grille jouable. */
  minCell?: number;
  /** Cases marquées d'une croix par le joueur. */
  marks?: ReadonlySet<number>;
  /** Cases tentées à tort : une croix rouge, définitive. */
  misses?: readonly number[];
  /** Case de la dernière erreur, qui tremble. */
  missed?: number;
  /** Textes des cases pour les lecteurs d'écran ; sans eux, la grille n'est pas touchable. */
  strings?: PandasStrings;
}

/** Écart maximal entre deux touchers sur la même case pour faire un double toucher. */
export const DOUBLE_TAP_MS = 350;

/** Ce que la grille demande au jeu. */
export interface GridActions {
  isMarked(cell: number): boolean;
  /** Met (`true`) ou enlève la croix d'une case ; sans effet sur une case déjà tentée. */
  setMark(cell: number, marked: boolean): void;
  /** Tente d'y poser un panda. */
  attempt(cell: number): void;
}

/** Case désignée par un élément de la grille jouable, ou `null`. */
const cellOf = (target: EventTarget | null): number | null => {
  const element = target instanceof Element ? target.closest<HTMLElement>('[data-cell]') : null;
  return element ? Number(element.dataset['cell']) : null;
};

/**
 * Commandes d'une grille jouable, écoutées sur `host` qui la contient : la grille est redessinée à chaque
 * changement, et un geste doit survivre au redessin. Un toucher ou un clic met ou enlève une croix ; glisser le
 * doigt (ou la souris, bouton enfoncé) met une croix sur chaque case parcourue, première case comprise, sans en
 * enlever aucune : seul un toucher levé sur la case où il a commencé enlève une croix ; un double toucher, un double clic ou un clic droit tente un panda. Le premier toucher d'un double toucher a
 * déjà agi : la tentative vaut quel que soit son effet.
 */
export function bindGridInput(host: HTMLElement, actions: GridActions): () => void {
  let last: { cell: number; at: number } | null = null;
  let drag: { start: number; current: number; moved: boolean } | null = null;
  // Un glissement se termine par un clic sur sa dernière case : il ne doit pas compter.
  let ignoreClick = false;

  const onClick = (event: MouseEvent) => {
    const cell = cellOf(event.target);
    if (cell === null) return;
    if (ignoreClick) {
      ignoreClick = false;
      return;
    }
    const now = Date.now();
    if (last?.cell === cell && now - last.at <= DOUBLE_TAP_MS) {
      last = null;
      actions.attempt(cell);
      return;
    }
    last = { cell, at: now };
    actions.setMark(cell, !actions.isMarked(cell));
  };
  const onContextMenu = (event: MouseEvent) => {
    const cell = cellOf(event.target);
    if (cell === null) return;
    event.preventDefault();
    last = null;
    actions.attempt(cell);
  };
  const onPointerDown = (event: PointerEvent) => {
    const cell = cellOf(event.target);
    if (cell === null || event.button !== 0) return;
    // Un toucher capture le doigt sur sa première case : sans ce relâchement, glisser ne verrait qu'elle.
    if (event.target instanceof Element && event.target.hasPointerCapture?.(event.pointerId)) {
      event.target.releasePointerCapture(event.pointerId);
    }
    ignoreClick = false;
    drag = { start: cell, current: cell, moved: false };
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!drag) return;
    const cell = cellOf(document.elementFromPoint(event.clientX, event.clientY));
    if (cell === null || cell === drag.current) return;
    if (!drag.moved) {
      drag.moved = true;
      actions.setMark(drag.start, true);
      last = null;
    }
    drag.current = cell;
    actions.setMark(cell, true);
  };
  const onPointerEnd = () => {
    if (drag?.moved) ignoreClick = true;
    drag = null;
  };

  host.addEventListener('click', onClick);
  host.addEventListener('contextmenu', onContextMenu);
  host.addEventListener('pointerdown', onPointerDown);
  host.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerEnd);
  window.addEventListener('pointercancel', onPointerEnd);
  return () => {
    window.removeEventListener('pointerup', onPointerEnd);
    window.removeEventListener('pointercancel', onPointerEnd);
  };
}

/** Côté d'une case selon la taille de la grille et la place disponible. */
export const cellSize = (size: number, available: number, min = MIN_CELL): number =>
  Math.max(min, Math.min(MAX_CELL, Math.floor(available / size)));

/** Bords épais d'une case, là où elle touche un autre bosquet ou le bord de la grille. */
function borders(grid: Grid, cell: number): string[] {
  const { size, regions } = grid;
  const region = regions[cell];
  const row = rowOf(cell, size);
  const col = colOf(cell, size);
  const sides: string[] = [];
  if (row === 0 || regions[cell - size] !== region) sides.push('edge-top');
  if (row === size - 1 || regions[cell + size] !== region) sides.push('edge-bottom');
  if (col === 0 || regions[cell - 1] !== region) sides.push('edge-left');
  if (col === size - 1 || regions[cell + 1] !== region) sides.push('edge-right');
  return sides;
}

function renderCell(grid: Grid, cell: number, pandas: Pandas, options: GridOptions): HTMLElement {
  const panda = pandas.includes(cell);
  const miss = options.misses?.includes(cell) ?? false;
  const mark = !panda && !miss && (options.marks?.has(cell) ?? false);
  const classes = ['pd-cell', ...borders(grid, cell)];
  if (panda) classes.push('panda');
  if (miss) classes.push('miss');
  if (options.missed === cell) classes.push('shake');
  const { strings } = options;
  const content = panda ? '🐼' : miss || mark ? '✕' : '';
  if (!strings) {
    return h(
      'div',
      { class: classes.join(' '), style: { background: REGION_COLORS[grid.regions[cell] ?? 0] ?? '' } },
      content,
    );
  }
  const place = strings.cell(rowOf(cell, grid.size) + 1, colOf(cell, grid.size) + 1);
  const state = panda ? strings.panda : miss ? strings.miss : mark ? strings.mark : null;
  const label = state ? `${place}, ${state}` : place;
  return h(
    'button',
    {
      class: classes.join(' '),
      type: 'button',
      style: { background: REGION_COLORS[grid.regions[cell] ?? 0] ?? '' },
      attrs: { 'aria-label': label, 'data-cell': String(cell) },
    },
    content,
  );
}

export function renderGrid(host: HTMLElement, grid: Grid, pandas: Pandas, options: GridOptions): void {
  const side = cellSize(grid.size, options.width, options.minCell);
  const element = h(
    'div',
    { class: 'pd-grid', style: { '--cs': `${side}px`, '--n': String(grid.size) } },
    ...grid.regions.map((_, cell) => renderCell(grid, cell, pandas, options)),
  );
  replaceChildren(host, element);
}

/** Petite grille non interactive (aperçu en direct d'un autre joueur). */
export function renderMiniGrid(grid: Grid, pandas: Pandas): HTMLElement {
  const host = h('div', { class: 'mini pd-mini' });
  renderGrid(host, grid, pandas, { width: MINI_WIDTH, minCell: 8 });
  return host;
}
