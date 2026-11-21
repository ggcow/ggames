// Partie de Pandas : un toucher met ou enlève une croix pour écarter une case, et glisser le doigt en met sur
// chaque case parcourue ; un triple toucher (ou un triple clic) tente d'y poser un panda. Sur une case de la
// solution, le panda reste ; ailleurs, la tentative perd la partie. Les tentatives forment le replay envoyé au
// serveur ; les croix restent sur l'écran.

import {
  attempt,
  encodeActions,
  isLost,
  LOSS_COOLDOWN_MS,
  type PandasState,
  solutionOf,
} from '../../../shared/games/pandas/definition.ts';
import { type Grid, isSolved, liveState } from '../../../shared/games/pandas/rules.ts';
import { h } from '../../platform/dom.ts';
import { minutesLeft } from '../../platform/level-grid.ts';
import { frameButton, mountPuzzleFrame } from '../puzzle-frame.ts';
import { bindGridInput, renderGrid } from './board.ts';
import type { PandasStrings } from './strings.ts';

export interface PandasPlayOptions {
  grid: Grid;
  strings: PandasStrings;
  onProgress(update: { state: string; value: number; replay: string }): void;
  onWin(replay: string): void;
  onLose(replay: string): void;
}

const START: PandasState = { pandas: [], misses: [] };

export function mountPandasPlay(host: HTMLElement, options: PandasPlayOptions): () => void {
  const { grid, strings } = options;
  const solution = solutionOf(grid);
  let state = START;
  let marks = new Set<number>();
  let cells: number[] = [];
  let missed: number | undefined;
  let finished = false;

  const restart = frameButton(strings.restart, () => reset());
  const table = mountPuzzleFrame(host, { buttons: [restart] });
  host.append(h('p', { class: 'pd-hint' }, strings.hint(minutesLeft(LOSS_COOLDOWN_MS))));

  const render = () => {
    restart.disabled = finished;
    renderGrid(table, grid, state.pandas, {
      width: (host.clientWidth || window.innerWidth) - 16,
      marks,
      misses: state.misses,
      ...(missed === undefined ? {} : { missed }),
      strings,
    });
    table.classList.toggle('solved', isSolved(grid, state.pandas));
  };

  const report = () =>
    options.onProgress({
      state: liveState(grid, state.pandas, state.misses.length),
      value: cells.length,
      replay: encodeActions(cells),
    });

  /** Met ou enlève la croix d'une case encore libre. */
  const setMark = (cell: number, marked: boolean) => {
    if (finished || state.pandas.includes(cell) || state.misses.includes(cell)) return;
    if (marks.has(cell) === marked) return;
    if (marked) marks.add(cell);
    else marks.delete(cell);
    missed = undefined;
    render();
  };

  /** Tente de poser un panda : il reste s'il est bien placé, sinon la case est marquée en erreur. */
  const tryPanda = (cell: number) => {
    if (finished) return;
    const next = attempt(grid, solution, state, cell);
    if (!next) return;
    missed = next.misses.length > state.misses.length ? cell : undefined;
    state = next;
    marks.delete(cell);
    cells.push(cell);
    const won = isSolved(grid, state.pandas);
    finished = won || isLost(state);
    render();
    report();
    if (won) options.onWin(encodeActions(cells));
    else if (finished) options.onLose(encodeActions(cells));
  };

  const unbind = bindGridInput(table, { isMarked: (cell) => marks.has(cell), setMark, attempt: tryPanda });

  const reset = () => {
    state = START;
    marks = new Set();
    cells = [];
    missed = undefined;
    finished = false;
    render();
    report();
  };

  const onResize = () => render();
  window.addEventListener('resize', onResize);
  render();
  report();
  return () => {
    unbind();
    window.removeEventListener('resize', onResize);
  };
}
