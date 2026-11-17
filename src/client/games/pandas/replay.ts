// Lecteur de replay : rejoue les tentatives d'une partie une à une, pandas posés et erreurs, avec lecture
// automatique. Pas de compteur : Pandas n'a pas de score.

import { decodeActions, type PandasState, playActions } from '../../../shared/games/pandas/definition.ts';
import type { Grid } from '../../../shared/games/pandas/rules.ts';
import { h, replaceChildren } from '../../platform/dom.ts';
import { renderGrid } from './board.ts';

const STEP_MS = 700;

export function mountPandasReplay(host: HTMLElement, grid: Grid, replay: string): () => void {
  const states: PandasState[] = playActions(grid, decodeActions(replay) ?? []) ?? [{ pandas: [], misses: [] }];
  let index = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  const gridHost = h('div', { class: 'board-host' });
  const slider = h('input', { type: 'range', attrs: { min: '0', max: String(states.length - 1), value: '0' } });
  const playButton = h('button', { class: 'btn primary' });

  const render = () => {
    slider.value = String(index);
    playButton.textContent = timer ? '⏸' : '▶';
    const state = states[index];
    renderGrid(gridHost, grid, state?.pandas ?? [], {
      width: (host.clientWidth || window.innerWidth) - 16,
      misses: state?.misses ?? [],
    });
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
