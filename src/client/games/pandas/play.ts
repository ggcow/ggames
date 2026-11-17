// Partie de Pandas : un clic ou un toucher pose ou retire un panda, un clic droit ou un appui long met ou enlève
// une croix pour écarter une case. Pas de score : ni compteur de coups ni Annuler, toucher un panda le retire.
// Les cases touchées sont mémorisées pour le replay envoyé au serveur ; les croix restent sur l'écran.

import { encodeActions } from '../../../shared/games/pandas/definition.ts';
import {
  conflicts,
  type Grid,
  isSolved,
  liveState,
  type Pandas,
  togglePanda,
} from '../../../shared/games/pandas/rules.ts';
import { h } from '../../platform/dom.ts';
import { frameButton, mountPuzzleFrame } from '../puzzle-frame.ts';
import { createGridInput, renderGrid } from './board.ts';
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
  let cells: number[] = [];
  let finished = false;

  const restart = frameButton(strings.restart, () => reset());
  const table = mountPuzzleFrame(host, { buttons: [restart] });
  host.append(h('p', { class: 'pd-hint' }, strings.hint));

  const render = () => {
    restart.disabled = finished;
    renderGrid(table, grid, pandas, {
      width: (host.clientWidth || window.innerWidth) - 16,
      marks,
      clashes: conflicts(grid, pandas),
      strings,
      input,
    });
    table.classList.toggle('solved', finished);
  };

  const report = () =>
    options.onProgress({ state: liveState(grid, pandas), value: cells.length, replay: encodeActions(cells) });

  /** Pose ou retire le panda d'une case. */
  const tap = (cell: number) => {
    if (finished) return;
    pandas = togglePanda(pandas, cell);
    marks.delete(cell);
    cells.push(cell);
    finished = isSolved(grid, pandas);
    render();
    report();
    if (finished) options.onWin(encodeActions(cells));
  };

  /** Met ou enlève la croix d'une case sans panda. */
  const mark = (cell: number) => {
    if (finished || pandas.includes(cell)) return;
    if (!marks.delete(cell)) marks.add(cell);
    render();
  };

  const input = createGridInput({ onTap: tap, onMark: mark });

  const reset = () => {
    pandas = [];
    marks = new Set();
    cells = [];
    finished = false;
    render();
    report();
  };

  const onResize = () => render();
  window.addEventListener('resize', onResize);
  render();
  report();
  return () => {
    input.dispose();
    window.removeEventListener('resize', onResize);
  };
}
