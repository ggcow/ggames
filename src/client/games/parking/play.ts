// Partie de Parking : glisser les véhicules, annuler, recommencer, sortir la voiture rouge.
// Chaque action est mémorisée pour produire le replay envoyé au serveur.

import { countMoves } from '../../../shared/games/moves.ts';
import { encodeActions, type ParkingAction } from '../../../shared/games/parking/definition.ts';
import { type Board, boardToString, isSolved, type Slide, slide } from '../../../shared/games/parking/rules.ts';
import { h } from '../../platform/dom.ts';
import { frameBadge, frameButton, mountPuzzleFrame } from '../puzzle-frame.ts';
import { bindParkingInput, renderParking } from './board.ts';
import type { ParkingStrings } from './strings.ts';

export interface ParkingPlayOptions {
  start: Board;
  strings: ParkingStrings;
  onProgress(update: { state: string; value: number; replay: string }): void;
  onWin(replay: string): void;
}

export function mountParkingPlay(host: HTMLElement, options: ParkingPlayOptions): () => void {
  const { strings } = options;
  let board = options.start;
  let actions: ParkingAction[] = [];
  let history: Board[] = [];
  let finished = false;

  const counter = frameBadge();
  const restart = frameButton(strings.restart, () => reset());
  const undo = frameButton(strings.undo, () => undoLast());
  const table = mountPuzzleFrame(host, { badge: counter, buttons: [restart, undo] });
  host.append(h('p', { class: 'pk-hint' }, strings.hint));

  const render = () => {
    counter.textContent = strings.moves(countMoves(actions));
    undo.disabled = history.length === 0 || finished;
    restart.disabled = finished;
    renderParking(table, board, {
      width: (host.clientWidth || window.innerWidth) - 16,
      leaving: finished,
      ...(finished ? {} : { strings }),
    });
  };

  const report = () =>
    options.onProgress({ state: boardToString(board), value: countMoves(actions), replay: encodeActions(actions) });

  const play = (move: Slide) => {
    const after = finished ? null : slide(board, move);
    if (!after) return;
    history.push(board);
    board = after;
    actions.push({ type: 'slide', ...move });
    finished = isSolved(board);
    render();
    report();
    if (finished) options.onWin(encodeActions(actions));
  };

  const undoLast = () => {
    const previous = history.pop();
    if (!previous || finished) return;
    board = previous;
    actions.push({ type: 'undo' });
    render();
    report();
  };

  const reset = () => {
    board = options.start;
    actions = [];
    history = [];
    finished = false;
    render();
    report();
  };

  const unbind = bindParkingInput(table, { board: () => board, slide: play });
  const onResize = () => render();
  window.addEventListener('resize', onResize);
  render();
  report();
  return () => {
    unbind();
    window.removeEventListener('resize', onResize);
  };
}
