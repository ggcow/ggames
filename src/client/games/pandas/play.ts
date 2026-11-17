// Partie de Pandas : chaque toucher fait passer une case de vide à croix, de croix à panda, de panda à vide.
// Seuls la pose et le retrait d'un panda sont des coups, mémorisés pour le replay envoyé au serveur.

import { countMoves } from '../../../shared/games/moves.ts';
import { encodeActions, type PandasAction } from '../../../shared/games/pandas/definition.ts';
import {
  conflicts,
  type Grid,
  isSolved,
  liveState,
  type Pandas,
  togglePanda,
} from '../../../shared/games/pandas/rules.ts';
import { h } from '../../platform/dom.ts';
import { mountPuzzleFrame } from '../puzzle-frame.ts';
import { renderGrid } from './board.ts';
import type { PandasStrings } from './strings.ts';

export interface PandasPlayOptions {
  grid: Grid;
  strings: PandasStrings;
  onProgress(update: { state: string; value: number; replay: string }): void;
  onWin(replay: string): void;
}

export function mountPandasPlay(host: HTMLElement, options: PandasPlayOptions): () => void {
  const { grid, strings } = options;
  let pandas: Pandas = [];
  let marks = new Set<number>();
  let actions: PandasAction[] = [];
  let history: Pandas[] = [];
  let finished = false;

  const frame = mountPuzzleFrame(host, {
    undoLabel: strings.undo,
    restartLabel: strings.restart,
    onUndo: () => undoLast(),
    onRestart: () => reset(),
  });
  host.append(h('p', { class: 'pd-hint' }, strings.hint));

  const render = () => {
    frame.counter.textContent = strings.moves(countMoves(actions));
    frame.undo.disabled = history.length === 0 || finished;
    frame.restart.disabled = finished;
    renderGrid(frame.table, grid, pandas, {
      width: (host.clientWidth || window.innerWidth) - 16,
      marks,
      clashes: conflicts(grid, pandas),
      strings,
      onTap: tap,
    });
    frame.table.classList.toggle('solved', finished);
  };

  const report = () =>
    options.onProgress({ state: liveState(grid, pandas), value: countMoves(actions), replay: encodeActions(actions) });

  /** Pose ou retire le panda d'une case : un coup. */
  const toggle = (cell: number) => {
    history.push(pandas);
    pandas = togglePanda(pandas, cell);
    marks.delete(cell);
    actions.push({ type: 'toggle', cell });
    finished = isSolved(grid, pandas);
    render();
    report();
    if (finished) options.onWin(encodeActions(actions));
  };

  const tap = (cell: number) => {
    if (finished) return;
    if (pandas.includes(cell) || marks.has(cell)) return toggle(cell);
    marks.add(cell);
    render();
  };

  const undoLast = () => {
    const previous = history.pop();
    if (!previous || finished) return;
    pandas = previous;
    actions.push({ type: 'undo' });
    render();
    report();
  };

  const reset = () => {
    pandas = [];
    marks = new Set();
    actions = [];
    history = [];
    finished = false;
    render();
    report();
  };

  const onResize = () => render();
  window.addEventListener('resize', onResize);
  render();
  report();
  return () => window.removeEventListener('resize', onResize);
}
