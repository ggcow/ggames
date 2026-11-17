// Lecteur de replay : rejoue le chemin final d'une partie, sans ses coups annulés, avec lecture automatique.

import { keptMoves } from '../../../shared/games/moves.ts';
import { decodeActions, playActions } from '../../../shared/games/pandas/definition.ts';
import type { Grid, Pandas } from '../../../shared/games/pandas/rules.ts';
import { h, replaceChildren } from '../../platform/dom.ts';
import { renderGrid } from './board.ts';
import type { PandasStrings } from './strings.ts';

const STEP_MS = 700;

export function mountPandasReplay(host: HTMLElement, grid: Grid, replay: string, strings: PandasStrings): () => void {
  // Les coups annulés n'apparaissent pas : on regarde le chemin final.
  const states: Pandas[] = playActions(grid, keptMoves(decodeActions(replay) ?? [])) ?? [[]];
  let index = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  const gridHost = h('div', { class: 'board-host' });
  const counter = h('span', { class: 'counter' });
  const slider = h('input', { type: 'range', attrs: { min: '0', max: String(states.length - 1), value: '0' } });
  const playButton = h('button', { class: 'btn primary' });

  const render = () => {
    counter.textContent = `${strings.moves(index)} / ${states.length - 1}`;
    slider.value = String(index);
    playButton.textContent = timer ? '⏸' : '▶';
    renderGrid(gridHost, grid, states[index] ?? [], { width: (host.clientWidth || window.innerWidth) - 16 });
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

  /** Arrête la lecture automatique et affiche l'état demandé. */
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
    h('div', { class: 'table' }, gridHost),
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
