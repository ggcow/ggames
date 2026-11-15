// Lecteur de replay : rejoue les états successifs d'une partie, avec lecture automatique.

import { decodeActions, playActions } from '../../../shared/games/bouquets/definition.ts';
import { type Board, cloneBoard, type ReadonlyBoard } from '../../../shared/games/bouquets/rules.ts';
import { countMoves } from '../../../shared/games/moves.ts';
import { h, replaceChildren } from '../../platform/dom.ts';
import { preloadArt } from './art.ts';
import { potsOf, renderBoard } from './board.ts';
import type { BouquetsStrings } from './strings.ts';

const STEP_MS = 700;

export function mountBouquetsReplay(
  host: HTMLElement,
  start: ReadonlyBoard,
  replay: string,
  strings: BouquetsStrings,
): () => void {
  preloadArt();
  const actions = decodeActions(replay) ?? [];
  const states: Board[] = playActions(cloneBoard(start), actions) ?? [cloneBoard(start)];
  let index = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  const boardHost = h('div', { class: 'board-host' });
  const counter = h('span', { class: 'counter' });
  const slider = h('input', { type: 'range', attrs: { min: '0', max: String(states.length - 1), value: '0' } });
  const playButton = h('button', { class: 'btn primary' });

  const render = () => {
    counter.textContent = `${strings.moves(countMoves(actions.slice(0, index)))} / ${countMoves(actions)}`;
    slider.value = String(index);
    playButton.textContent = timer ? '⏸' : '▶';
    renderBoard(boardHost, potsOf(states[index] ?? []), { width: host.clientWidth || window.innerWidth, strings });
  };

  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  const goTo = (target: number) => {
    index = Math.max(0, Math.min(states.length - 1, target));
    if (index === states.length - 1) stop();
    render();
  };

  /** Arrête la lecture automatique et affiche l’état demandé. */
  const jump = (target: number) => {
    stop();
    goTo(target);
  };

  const toggle = () => {
    if (timer) {
      stop();
      return render();
    }
    if (index === states.length - 1) index = 0;
    timer = setInterval(() => goTo(index + 1), STEP_MS);
    render();
  };

  slider.addEventListener('input', () => jump(Number(slider.value)));
  playButton.addEventListener('click', toggle);

  replaceChildren(
    host,
    h('div', { class: 'counter-row' }, counter),
    h('div', { class: 'table' }, boardHost),
    slider,
    h(
      'div',
      { class: 'controls' },
      h('button', { class: 'btn', on: { click: () => jump(0) } }, '⏮'),
      h('button', { class: 'btn', on: { click: () => jump(index - 1) } }, '◀'),
      playButton,
      h('button', { class: 'btn', on: { click: () => jump(index + 1) } }, '▶|'),
    ),
  );
  render();
  return stop;
}
