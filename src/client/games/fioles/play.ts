// Partie de Fioles : sélection, versement, annulation, détection de victoire.
// Chaque action est mémorisée pour produire le replay envoyé au serveur.

import { encodeActions, type FiolesAction } from '../../../shared/games/fioles/definition.ts';
import {
  type Board,
  boardToString,
  canPour,
  cloneBoard,
  isSolved,
  isTubeDone,
  pour,
  type ReadonlyBoard,
} from '../../../shared/games/fioles/rules.ts';
import { h, replaceChildren } from '../../platform/dom.ts';
import { renderBoard, shake } from './board.ts';
import type { FiolesStrings } from './strings.ts';

export interface FiolesPlayOptions {
  start: ReadonlyBoard;
  strings: FiolesStrings;
  onProgress(update: { state: string; value: number; replay: string }): void;
  onWin(replay: string): void;
}

export function mountFiolesPlay(host: HTMLElement, options: FiolesPlayOptions): () => void {
  const { strings } = options;
  let board: Board = cloneBoard(options.start);
  let actions: FiolesAction[] = [];
  let history: Board[] = [];
  let selected = -1;
  let finished = false;

  const boardHost = h('div', { class: 'board-host' });
  const counter = h('span', { class: 'counter' });
  const undo = h('button', { class: 'btn', on: { click: () => undoLast() } }, strings.undo);
  const restart = h('button', { class: 'btn', on: { click: () => reset() } }, strings.restart);
  replaceChildren(
    host,
    h('div', { class: 'counter-row' }, counter),
    h('div', { class: 'table' }, boardHost),
    h('div', { class: 'controls' }, undo, restart),
  );

  const render = (arrived?: { tube: number; count: number }) => {
    counter.textContent = strings.moves(actions.length);
    undo.disabled = history.length === 0 || finished;
    restart.disabled = finished;
    renderBoard(boardHost, board, {
      selected,
      ...(arrived ? { arrived } : {}),
      width: host.clientWidth || window.innerWidth,
      onTap: tap,
    });
  };

  const report = () =>
    options.onProgress({ state: boardToString(board), value: actions.length, replay: encodeActions(actions) });

  const tap = (index: number, element: HTMLElement) => {
    if (finished) return;
    const tube = board[index];
    if (!tube) return;
    const canSelect = tube.length > 0 && !isTubeDone(tube);
    if (selected === -1) {
      selected = canSelect ? index : -1;
      return render();
    }
    if (selected === index) {
      selected = -1;
      return render();
    }
    const source = board[selected];
    if (source && canPour(source, tube)) {
      history.push(cloneBoard(board));
      const count = pour(board, selected, index);
      actions.push({ type: 'pour', from: selected, to: index });
      selected = -1;
      finished = isSolved(board);
      render({ tube: index, count });
      report();
      if (finished) options.onWin(encodeActions(actions));
      return;
    }
    if (canSelect) {
      selected = index;
      return render();
    }
    shake(element);
  };

  const undoLast = () => {
    const previous = history.pop();
    if (!previous || finished) return;
    board = previous;
    actions.push({ type: 'undo' });
    selected = -1;
    render();
    report();
  };

  const reset = () => {
    board = cloneBoard(options.start);
    actions = [];
    history = [];
    selected = -1;
    finished = false;
    render();
    report();
  };

  const onResize = () => render();
  window.addEventListener('resize', onResize);
  render();
  return () => window.removeEventListener('resize', onResize);
}
