// Affichage de Couteaux : la planète, les couteaux plantés et celui qu'on lance. Les dimensions viennent de la
// largeur disponible ; la feuille de style place chaque couteau d'après son angle (`--a`, en degrés).

import { type Level, TURN } from '../../../shared/games/couteaux/rules.ts';
import { h, replaceChildren } from '../../platform/dom.ts';

/** Côté d'une scène jouable au plus et au moins, en pixels. */
const MAX_STAGE = 360;
const MIN_STAGE = 220;

/** Largeur de calcul d'un aperçu, que la feuille de style étire ensuite à la largeur de sa carte. */
export const MINI_STAGE = 96;

/** Un couteau : déjà planté au départ (`obstacle`) ou planté par le joueur (`mine`). */
export type KnifeKind = 'obstacle' | 'mine';

/** Angle de la planète en degrés, pour la feuille de style. */
export const degrees = (angle: number): number => (angle * 360) / TURN;

/** Proportions de la scène, relatives à son côté. */
const RADIUS = 0.22;
const KNIFE = 0.2;
const KNIFE_WIDTH = 0.034;
/** Part de la lame enfoncée dans la planète. */
const SINK = 0.035;
/** Course d'un couteau, de sa position d'attente jusqu'à la planète. */
const RUN = 0.3;

/** Variables de taille d'une scène de côté `side`. */
function sizes(side: number): Record<string, string> {
  const px = (ratio: number) => `${Math.round(side * ratio * 10) / 10}px`;
  return {
    '--s': px(1),
    '--r': px(RADIUS),
    '--kl': px(KNIFE),
    '--kw': px(KNIFE_WIDTH),
    '--sink': px(SINK),
    '--run': px(RUN),
  };
}

/** Un couteau planté, à l'angle `angle` de la planète. */
export const knifeElement = (angle: number, kind: KnifeKind): HTMLElement =>
  h(
    'div',
    { class: `ct-knife ${kind}`, style: { '--a': String(degrees(angle)) } },
    h('span', { class: 'ct-blade' }),
    h('span', { class: 'ct-handle' }),
  );

/** Éléments d'une scène, que l'écran de jeu ou de replay met à jour image par image. */
export interface Stage {
  readonly root: HTMLElement;
  /** Enveloppe de la planète : secouée quand un couteau s'y plante. */
  readonly planet: HTMLElement;
  /** Partie tournante : la surface et les couteaux plantés. */
  readonly spin: HTMLElement;
  /** Couteau en attente ou en vol, dans le repère fixe de la scène. */
  readonly shot: HTMLElement;
  /** Couteaux restant à planter. */
  readonly left: HTMLElement;
}

/** Côté d'une scène jouable dans une largeur `width` : assez grande pour viser, jamais encombrante. */
export const stageSide = (width: number): number => Math.min(MAX_STAGE, Math.max(MIN_STAGE, width));

/** Construit dans `host` une scène de côté `side`, avec les obstacles du niveau. */
export function mountStage(host: HTMLElement, level: Level, side: number): Stage {
  const spin = h(
    'div',
    { class: 'ct-spin' },
    ...level.obstacles.map((angle) => knifeElement(angle, 'obstacle')),
    h('div', { class: 'ct-surface' }),
  );
  const planet = h('div', { class: 'ct-planet' }, spin);
  const shot = h(
    'div',
    { class: 'ct-knife mine ct-shot' },
    h('span', { class: 'ct-blade' }),
    h('span', { class: 'ct-handle' }),
  );
  const left = h('span', { class: 'ct-left' });
  const root = h('div', { class: 'ct-stage', style: sizes(side) }, planet, shot, left);
  replaceChildren(host, root);
  return { root, planet, spin, shot, left };
}

/** Tourne la planète de `angle` (dixièmes de degré). */
export const turnPlanet = (stage: Stage, angle: number): void =>
  stage.spin.style.setProperty('transform', `rotate(${degrees(angle)}deg)`);

/** Plante un couteau du joueur sur la planète, sous sa surface pour que la pointe y disparaisse. */
export function plantKnife(stage: Stage, angle: number): void {
  stage.spin.insertBefore(knifeElement(angle, 'mine'), stage.spin.lastChild);
  stage.planet.classList.remove('thud');
  // Relancer l'animation : la classe retirée puis remise dans la même image ne suffirait pas.
  void stage.planet.offsetWidth;
  stage.planet.classList.add('thud');
}

/** Retire les couteaux plantés par le joueur, pour recommencer. */
export const clearKnives = (stage: Stage): void => {
  for (const knife of stage.spin.querySelectorAll('.ct-knife.mine')) knife.remove();
};

/**
 * Place le couteau lancé : `progress` va de 0 (en attente, en bas) à 1 (arrivé sur la planète). `null` le cache,
 * quand il n'en reste plus à lancer.
 */
export function placeShot(stage: Stage, progress: number | null): void {
  stage.shot.hidden = progress === null;
  stage.shot.style.setProperty('--d', String(1 - Math.min(1, Math.max(0, progress ?? 0))));
}

/** Fait tomber un couteau qui a rebondi, depuis la planète. */
export function bounceKnife(stage: Stage): void {
  const falling = h(
    'div',
    { class: 'ct-knife mine ct-shot bounce' },
    h('span', { class: 'ct-blade' }),
    h('span', { class: 'ct-handle' }),
  );
  falling.addEventListener('animationend', () => falling.remove());
  stage.root.append(falling);
}

/** Aperçu en direct d'un autre joueur : la planète, ses obstacles et les couteaux qu'il y a plantés. */
export function renderMiniTarget(level: Level, planted: readonly number[]): HTMLElement {
  const host = h('div', { class: 'mini ct-mini' });
  const stage = mountStage(host, level, MINI_STAGE);
  for (const angle of planted) stage.spin.insertBefore(knifeElement(angle, 'mine'), stage.spin.lastChild);
  stage.shot.remove();
  stage.left.remove();
  return host;
}
