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
  /** Pandas qui enfreignent une règle. */
  clashes?: ReadonlySet<number>;
  /** Textes des cases pour les lecteurs d'écran ; sans eux, la grille n'est pas touchable. */
  strings?: PandasStrings;
  onTap?: (cell: number) => void;
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
  const mark = !panda && (options.marks?.has(cell) ?? false);
  const classes = ['pd-cell', ...borders(grid, cell)];
  if (panda) classes.push('panda');
  if (options.clashes?.has(cell)) classes.push('clash');
  const { strings, onTap } = options;
  const content = panda ? '🐼' : mark ? '✕' : '';
  if (!strings || !onTap) {
    return h(
      'div',
      { class: classes.join(' '), style: { background: REGION_COLORS[grid.regions[cell] ?? 0] ?? '' } },
      content,
    );
  }
  const place = strings.cell(rowOf(cell, grid.size) + 1, colOf(cell, grid.size) + 1);
  const label = panda ? `${place}, ${strings.panda}` : mark ? `${place}, ${strings.mark}` : place;
  return h(
    'button',
    {
      class: classes.join(' '),
      type: 'button',
      style: { background: REGION_COLORS[grid.regions[cell] ?? 0] ?? '' },
      attrs: { 'aria-label': label },
      on: { click: () => onTap(cell) },
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
