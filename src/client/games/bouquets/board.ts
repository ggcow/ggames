// Affichage des pots. Aucun état : on redessine tout le plateau à chaque changement.
// Chaque pot empile quatre calques : le pot entier, l'ombre de la couche suivante aux places libres du devant,
// les fleurs du devant plantées dans le terreau, puis le rebord avant et le corps du pot, qui cachent le bas des
// tiges.

import type { LivePot, ReadonlyBoard, Slot } from '../../../shared/games/bouquets/rules.ts';
import { frontOf } from '../../../shared/games/bouquets/rules.ts';
import { h, replaceChildren } from '../../platform/dom.ts';
import { flowerArt, POT_BACK, POT_FRONT } from './art.ts';
import type { BouquetsStrings } from './strings.ts';

/** Ce qui s'affiche d'un pot : son devant, la couche suivante si on la connaît, le nombre de couches cachées. */
export interface PotView {
  front: readonly Slot[];
  next: readonly Slot[] | null;
  hidden: number;
}

export const potsOf = (board: ReadonlyBoard): PotView[] =>
  board.map((pot) => ({ front: frontOf(pot), next: pot[1] ?? null, hidden: pot.length - 1 }));

/** Pots d'un autre joueur, vus de l'extérieur : sa couche suivante reste inconnue. */
export const livePots = (pots: readonly LivePot[]): PotView[] =>
  pots.map((pot) => ({ front: pot.front, next: null, hidden: pot.hidden }));

export const POTS_PER_ROW = 3;

/** Place de chaque emplacement dans le pot : centre (fraction de la largeur), pied de la tige (fraction de la hauteur). */
export const FRONT_PLACES: readonly (readonly [number, number])[] = [
  [0.2, 0.26],
  [0.5, 0.3],
  [0.8, 0.26],
];
/** La couche suivante est plantée au même endroit, plus au fond du terreau. */
const NEXT_PLACES: readonly (readonly [number, number])[] = [
  [0.2, 0.2],
  [0.5, 0.22],
  [0.8, 0.2],
];

/** Largeur d'un pot jouable au plus, et au moins (assez large pour le doigt). */
const MAX_POT = 120;
export const MIN_POT = 84;
/** Largeur d'un aperçu : deux aperçus tiennent côte à côte sur un écran de 375 px. */
export const MINI_WIDTH = 150;

/** Pots par rangée sur un aperçu : quatre, pour qu'il reste bas. */
const MINI_PER_ROW = 4;

/** Largeur d'un pot pour `perRow` pots par rangée dans `available` pixels. */
export function potWidth(available: number, min = MIN_POT, perRow = POTS_PER_ROW): number {
  return Math.max(min, Math.min(MAX_POT, Math.floor(available / (perRow + 0.4))));
}

export interface BoardOptions {
  /** Largeur disponible en pixels. */
  width: number;
  /** Largeur minimale d'un pot ; plus petite pour un aperçu. */
  minPot?: number;
  /** Pots par rangée (trois par défaut). */
  perRow?: number;
  /** Textes pour nommer les fleurs ; sans eux, les images sont décoratives (aperçu). */
  strings?: BouquetsStrings;
  /** Fleur soulevée (touchée, en attente de sa destination). */
  lifted?: { pot: number; slot: number } | null;
  /** Pots dont la couche suivante vient d'avancer : leurs fleurs sortent de l'ombre. */
  revealed?: readonly number[];
}

function flowerImage(kind: number, strings?: BouquetsStrings): HTMLImageElement {
  return h('img', {
    class: 'bq-flower',
    attrs: { src: flowerArt(kind), alt: strings?.flower(kind) ?? '', draggable: 'false' },
  });
}

function slotElement(kind: Slot, place: number, layer: 'front' | 'next', strings?: BouquetsStrings): HTMLElement {
  const [x, base] = (layer === 'front' ? FRONT_PLACES : NEXT_PLACES)[place] ?? [0.5, 0.3];
  return h(
    'div',
    {
      class: kind === null ? `bq-slot ${layer}` : `bq-slot ${layer} filled`,
      attrs: { 'data-place': String(place) },
      style: { '--x': String(x), '--base': String(base) },
    },
    kind === null ? null : flowerImage(kind, strings),
  );
}

function potElement(pot: PotView, index: number, options: BoardOptions): HTMLElement {
  const classes = ['bq-pot'];
  if (options.revealed?.includes(index)) classes.push('revealed');
  const element = h(
    'div',
    { class: classes.join(' '), attrs: { 'data-pot': String(index) } },
    h('img', { class: 'bq-clay back', attrs: { src: POT_BACK, alt: '', draggable: 'false' } }),
    // L'ombre de la couche suivante n'apparaît qu'aux places libres du devant.
    ...(pot.next ?? []).map((kind, place) =>
      pot.front[place] === null && kind !== null ? slotElement(kind, place, 'next', options.strings) : null,
    ),
    ...pot.front.map((kind, place) => {
      const slot = slotElement(kind, place, 'front', options.strings);
      if (options.lifted?.pot === index && options.lifted.slot === place) slot.classList.add('lifted');
      return slot;
    }),
    h('img', { class: 'bq-clay front', attrs: { src: POT_FRONT, alt: '', draggable: 'false' } }),
  );
  if (pot.hidden > 0) {
    const label = options.strings?.layers(pot.hidden) ?? '';
    element.append(h('span', { class: 'bq-badge', attrs: { title: label, 'aria-label': label } }, String(pot.hidden)));
  }
  return element;
}

export function renderBoard(host: HTMLElement, pots: readonly PotView[], options: BoardOptions): void {
  const perRow = options.perRow ?? POTS_PER_ROW;
  const width = potWidth(options.width, options.minPot, perRow);
  const board = h('div', { class: 'bq-board', style: { '--pw': `${width}px` } });
  for (let row = 0; row < pots.length; row += perRow) {
    board.append(
      h(
        'div',
        { class: 'bq-row' },
        ...pots.slice(row, row + perRow).map((pot, i) => potElement(pot, row + i, options)),
      ),
    );
  }
  replaceChildren(host, board);
}

/**
 * Bouquet qui s'envole, posé par-dessus le pot dont `rect` est la place à l'écran : ses trois fleurs pareilles se
 * rassemblent puis montent en s'effaçant (animation CSS).
 */
export function bouquetBurst(kind: number, rect: DOMRect): HTMLElement {
  return h(
    'div',
    {
      class: 'bq-burst',
      attrs: { 'aria-hidden': 'true' },
      style: {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        '--pw': `${rect.width}px`,
      },
    },
    ...FRONT_PLACES.map((_, place) => slotElement(kind, place, 'front')),
  );
}

/** Petit plateau non interactif (aperçu en direct d'un autre joueur). */
export function renderMiniBoard(pots: readonly PotView[]): HTMLElement {
  const host = h('div', { class: 'mini' });
  renderBoard(host, pots, { width: MINI_WIDTH, minPot: 24, perRow: MINI_PER_ROW });
  return host;
}
