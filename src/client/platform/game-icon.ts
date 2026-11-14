// Icône d'un jeu, telle que le jeu la déclare : un emoji ou une image. Décorative : le nom du jeu ou du niveau
// est toujours écrit à côté.

import type { GameIcon } from '../games/client-game.ts';
import { h } from './dom.ts';

export function gameIcon(icon: GameIcon): HTMLElement {
  if (icon.kind === 'emoji') return h('span', { class: 'game-glyph', attrs: { 'aria-hidden': 'true' } }, icon.emoji);
  return h('img', { class: 'game-glyph', attrs: { src: icon.src, alt: '', draggable: 'false' } });
}
