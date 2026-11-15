// Lecteur de replay : rejoue le chemin final d'une partie, sans ses coups annulés, avec lecture automatique.

import { decodeActions, playActions } from '../../../shared/games/fioles/definition.ts';
import type { Board, ReadonlyBoard } from '../../../shared/games/fioles/rules.ts';
import { keptMoves } from '../../../shared/games/moves.ts';
import { h, replaceChildren } from '../../platform/dom.ts';
import { renderBoard } from './board.ts';
import type { FiolesStrings } from './strings.ts';

const STEP_MS = 700;

export function mountFiolesReplay(
  host: HTMLElement,
  start: ReadonlyBoard,
  replay: string,
  strings: FiolesStrings,
): () => void {
  // Les coups annulés n'apparaissent pas : on regarde le chemin final.
  const actions = keptMoves(decodeActions(replay) ?? []);
  const states: Board[] = playActions(
    start.map((t) => [...t]),
    actions,
  ) ?? [start.map((t) => [...t])];
  let index = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  const boardHost = h('div', { class: 'board-host' });
  const counter = h('span', { class: 'counter' });
  const slider = h('input', { type: 'range', attrs: { min: '0', max: String(states.length - 1), value: '0' } });
  const playButton = h('button', { class: 'btn primary' });

  const render = () => {
    counter.textContent = `${strings.moves(index)} / ${states.length - 1}`;
    slider.value = String(index);
    playButton.textContent = timer ? '⏸' : '▶';
    renderBoard(boardHost, states[index] ?? [], { width: host.clientWidth || window.innerWidth });
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
