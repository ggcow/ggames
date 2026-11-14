// Illustrations de Bouquets, servies par le site (site/games/bouquets/) : une image par espèce de fleur, le pot en
// deux calques (le pot entier derrière les fleurs, son rebord avant et son corps devant), l'icône du jeu.

const BASE = '/games/bouquets/';

/** Image de chaque espèce (index = espèce). */
export const FLOWER_ART = [
  'peony',
  'hydrangea',
  'sunflower',
  'rose',
  'daisy',
  'lavender',
  'tulip',
  'iris',
  'dahlia',
  'ranunculus',
  'pansy',
  'lily-of-the-valley',
].map((name) => `${BASE}${name}.webp`);

/** Pot entier, dessiné derrière les fleurs. */
export const POT_BACK = `${BASE}pot.webp`;
/** Rebord avant et corps du pot, dessinés devant les fleurs : le bas des tiges plonge dans le terreau. */
export const POT_FRONT = `${BASE}pot-front.webp`;
export const ICON = `${BASE}icon.webp`;

export const flowerArt = (flower: number): string => FLOWER_ART[flower] ?? FLOWER_ART[0] ?? '';

/** Charge toutes les images à l'ouverture d'une partie, pour qu'aucune n'apparaisse en retard pendant le jeu. */
export function preloadArt(): void {
  for (const src of [...FLOWER_ART, POT_BACK, POT_FRONT]) new Image().src = src;
}
