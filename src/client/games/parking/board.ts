// Affichage d'un parking et commandes de glissement. Aucun état : on redessine tout le parking à chaque coup ;
// pendant un glissement, seul le véhicule tenu suit le doigt.

import {
  type Board,
  EXIT_ROW,
  RED,
  SIZE,
  type Slide,
  slideRange,
  type Vehicle,
} from '../../../shared/games/parking/rules.ts';
import { h, replaceChildren } from '../../platform/dom.ts';
import type { ParkingStrings } from './strings.ts';

/** Teinte de chaque véhicule après la voiture rouge : vives, distinctes entre elles et du rouge. */
export const VEHICLE_COLORS = [
  '#4dabf7',
  '#ffd43b',
  '#69db7c',
  '#b197fc',
  '#ffa94d',
  '#3bc9db',
  '#f783ac',
  '#a9e34b',
  '#748ffc',
  '#e599f7',
  '#63e6be',
  '#ced4da',
  '#fab005',
  '#9775fa',
] as const;

/** Couleur d'un véhicule ; la voiture rouge garde la sienne. */
export const vehicleColor = (vehicle: number): string =>
  vehicle === RED ? '#f03e3e' : (VEHICLE_COLORS[(vehicle - 1) % VEHICLE_COLORS.length] ?? '#ced4da');

/** Côté d'une case touchable au plus et au moins, en pixels. */
const MAX_CELL = 58;
export const MIN_CELL = 36;

/** Largeur d'un aperçu : deux aperçus tiennent côte à côte sur un écran de 375 px. */
export const MINI_WIDTH = 132;

/** Côté d'une case selon la place disponible. */
export const cellSize = (available: number, min = MIN_CELL): number =>
  Math.max(min, Math.min(MAX_CELL, Math.floor(available / SIZE)));

export interface ParkingOptions {
  /** Largeur disponible en pixels. */
  width: number;
  /** Côté minimal d'une case : assez large pour le doigt sur un parking jouable. */
  minCell?: number;
  /** Textes des véhicules pour les lecteurs d'écran ; sans eux, le parking n'est pas touchable. */
  strings?: ParkingStrings;
  /** La voiture rouge s'en va par la sortie. */
  leaving?: boolean;
}

function renderVehicle(vehicle: Vehicle, index: number, options: ParkingOptions): HTMLElement {
  const classes = ['pk-car', vehicle.horizontal ? 'pk-h' : 'pk-v'];
  if (index === RED) classes.push('pk-red');
  if (index === RED && options.leaving) classes.push('pk-leaving');
  const style = {
    '--r': String(vehicle.row),
    '--c': String(vehicle.col),
    '--len': String(vehicle.length),
    '--paint': vehicleColor(index),
  };
  const { strings } = options;
  if (!strings) return h('div', { class: classes.join(' '), style });
  return h('button', {
    class: classes.join(' '),
    type: 'button',
    style,
    attrs: { 'data-vehicle': String(index), 'aria-label': strings.vehicle(index === RED, vehicle.horizontal) },
  });
}

export function renderParking(host: HTMLElement, board: Board, options: ParkingOptions): void {
  const side = cellSize(options.width, options.minCell);
  const lot = h(
    'div',
    { class: 'pk-lot', style: { '--cs': `${side}px`, '--n': String(SIZE), '--exit': String(EXIT_ROW) } },
    h('div', { class: 'pk-exit' }),
    ...board.map((vehicle, index) => renderVehicle(vehicle, index, options)),
  );
  replaceChildren(host, lot);
}

/** Petit parking non interactif (aperçu en direct d'un autre joueur). */
export function renderMiniParking(board: Board): HTMLElement {
  const host = h('div', { class: 'mini pk-mini' });
  renderParking(host, board, { width: MINI_WIDTH, minCell: 8 });
  return host;
}

/* ---------- Commandes ---------- */

/** Ce que le parking demande au jeu. */
export interface ParkingInput {
  /** Parking affiché, d'où partent les glissements. */
  board(): Board;
  /** Glissement voulu par le joueur, déjà vérifié possible. */
  slide(move: Slide): void;
}

/** Véhicule désigné par un élément du parking jouable, ou `null`. */
const vehicleOf = (target: EventTarget | null): { index: number; element: HTMLElement } | null => {
  const element = target instanceof Element ? target.closest<HTMLElement>('[data-vehicle]') : null;
  return element ? { index: Number(element.dataset['vehicle']), element } : null;
};

/** Côté d'une case du parking affiché dans `host`, en pixels. */
const cellOf = (host: HTMLElement): number => {
  const lot = host.querySelector<HTMLElement>('.pk-lot');
  return Number.parseFloat(lot?.style.getPropertyValue('--cs') ?? '') || MAX_CELL;
};

const ARROWS: Record<string, { horizontal: boolean; delta: number }> = {
  ArrowLeft: { horizontal: true, delta: -1 },
  ArrowRight: { horizontal: true, delta: 1 },
  ArrowUp: { horizontal: false, delta: -1 },
  ArrowDown: { horizontal: false, delta: 1 },
};

/**
 * Commandes d'un parking jouable, écoutées sur `host` qui le contient : le parking est redessiné à chaque coup.
 * Glisser un véhicule du doigt (ou de la souris) le fait suivre le long de son axe, arrêté par les autres ; au
 * lâcher, il se range sur la case la plus proche, et le coup compte s'il a changé de case ; un geste interrompu
 * par le système le ramène à sa place. Les flèches du clavier déplacent d'une case le véhicule qui a le focus.
 */
export function bindParkingInput(host: HTMLElement, input: ParkingInput): () => void {
  let drag: {
    pointer: number;
    index: number;
    element: HTMLElement;
    horizontal: boolean;
    origin: number;
    min: number;
    max: number;
    cell: number;
    offset: number;
  } | null = null;

  const onPointerDown = (event: PointerEvent) => {
    const target = vehicleOf(event.target);
    const vehicle = target ? input.board()[target.index] : undefined;
    if (!target || !vehicle || event.button !== 0 || drag) return;
    event.preventDefault();
    const { min, max } = slideRange(input.board(), target.index);
    drag = {
      pointer: event.pointerId,
      ...target,
      horizontal: vehicle.horizontal,
      origin: vehicle.horizontal ? event.clientX : event.clientY,
      min,
      max,
      cell: cellOf(host),
      offset: 0,
    };
    target.element.classList.add('pk-held');
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const moved = (drag.horizontal ? event.clientX : event.clientY) - drag.origin;
    drag.offset = Math.max(drag.min, Math.min(drag.max, moved / drag.cell));
    const shift = `${drag.offset * drag.cell}px`;
    drag.element.style.transform = drag.horizontal ? `translateX(${shift})` : `translateY(${shift})`;
  };
  /** Repose le véhicule tenu ; `keep` : le coup compte, sinon (geste interrompu par le système) il revient. */
  const release = (event: PointerEvent, keep: boolean) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const { index, element, offset } = drag;
    drag = null;
    element.classList.remove('pk-held');
    element.style.transform = '';
    const delta = Math.round(offset);
    if (keep && delta !== 0) input.slide({ vehicle: index, delta });
  };
  const onPointerUp = (event: PointerEvent) => release(event, true);
  const onPointerCancel = (event: PointerEvent) => release(event, false);
  const onKeyDown = (event: KeyboardEvent) => {
    const target = vehicleOf(event.target);
    const arrow = ARROWS[event.key];
    const vehicle = target ? input.board()[target.index] : undefined;
    if (!target || !arrow || !vehicle || vehicle.horizontal !== arrow.horizontal) return;
    event.preventDefault();
    const { min, max } = slideRange(input.board(), target.index);
    if (arrow.delta >= min && arrow.delta <= max) input.slide({ vehicle: target.index, delta: arrow.delta });
    host.querySelector<HTMLElement>(`[data-vehicle="${target.index}"]`)?.focus();
  };

  host.addEventListener('pointerdown', onPointerDown);
  host.addEventListener('keydown', onKeyDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);
  return () => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
  };
}
