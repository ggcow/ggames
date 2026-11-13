// Éditeur de niveaux : composer un plateau, le résoudre soi-même, puis le publier.
// Le brouillon est gardé sur l'appareil pour ne rien perdre en quittant l'écran.

import {
  type Board,
  boardToString,
  CAP,
  COLORS,
  generateBoard,
  isSolved,
  MAX_COLORS,
  parseBoard,
} from '../../../shared/games/fioles/rules.ts';
import { cleanTitle } from '../../../shared/platform/protocol.ts';
import { isRecord } from '../../../shared/platform/validate.ts';
import { h, replaceChildren } from '../../platform/dom.ts';
import { browserStorage, createLocalStore } from '../../platform/storage.ts';
import { PLATFORM_STRINGS } from '../../platform/strings.ts';
import { errorMessage, toast } from '../../platform/ui.ts';
import type { CreatorContext } from '../client-game.ts';
import { renderBoard, shake } from './board.ts';
import { mountFiolesPlay } from './play.ts';
import { FIOLES_STRINGS } from './strings.ts';

const ERASER = -1;
const DRAFT_KEY = 'fioles.draft';
const MIN_COLORS = 2;
const MIN_EMPTY = 1;
const MAX_EMPTY = 4;

export interface Draft {
  colors: number;
  empty: number;
  board: Board;
  title: string;
}

export const emptyDraft = (colors: number, empty: number, title = ''): Draft => ({
  colors,
  empty,
  board: Array.from({ length: colors + empty }, () => []),
  title,
});

/** Brouillon relu depuis le stockage ; `null` s'il est incohérent. */
export function parseDraft(raw: unknown): Draft | null {
  if (!isRecord(raw)) return null;
  const { colors, empty, board, title } = raw;
  if (typeof colors !== 'number' || colors < MIN_COLORS || colors > MAX_COLORS) return null;
  if (typeof empty !== 'number' || empty < MIN_EMPTY || empty > MAX_EMPTY) return null;
  if (!Array.isArray(board) || board.length !== colors + empty) return null;
  const tubes = board.filter(
    (tube): tube is number[] =>
      Array.isArray(tube) &&
      tube.length <= CAP &&
      tube.every((c) => Number.isInteger(c) && (c as number) >= 0 && (c as number) < colors),
  );
  if (tubes.length !== board.length) return null;
  return { colors, empty, board: tubes, title: cleanTitle(title) };
}

export const countColor = (board: Board, color: number): number =>
  board.reduce((sum, tube) => sum + tube.filter((c) => c === color).length, 0);

/** Problème empêchant de tester le brouillon, ou null s'il est prêt. */
export function draftProblem(draft: Draft): 'needFull' | 'alreadySolved' | null {
  for (let color = 0; color < draft.colors; color++) if (countColor(draft.board, color) !== CAP) return 'needFull';
  if (parseBoard(boardToString(draft.board)) === null) return 'needFull';
  return isSolved(draft.board) ? 'alreadySolved' : null;
}

export function mountFiolesEditor(host: HTMLElement, ctx: CreatorContext): () => void {
  const strings = FIOLES_STRINGS[ctx.lang];
  const store = createLocalStore(browserStorage());
  let draft: Draft = store.get(DRAFT_KEY, parseDraft) ?? emptyDraft(4, 2);
  let pick = 0;
  let unmountTest: (() => void) | null = null;

  const save = () => store.set(DRAFT_KEY, draft);

  const stepper = (label: string, value: number, change: (delta: number) => void) =>
    h(
      'div',
      { class: 'card row' },
      h('span', { class: 'grow' }, label),
      h('button', { on: { click: () => change(-1) } }, '−'),
      h('strong', { class: 'stepper-value' }, String(value)),
      h('button', { on: { click: () => change(1) } }, '+'),
    );

  const setColors = (delta: number) => {
    const colors = Math.max(MIN_COLORS, Math.min(MAX_COLORS, draft.colors + delta));
    if (colors === draft.colors) return;
    draft = emptyDraft(colors, draft.empty, draft.title);
    pick = 0;
    renderEditor();
  };

  const setEmpty = (delta: number) => {
    const empty = Math.max(MIN_EMPTY, Math.min(MAX_EMPTY, draft.empty + delta));
    if (empty === draft.empty) return;
    const removed = draft.board.slice(draft.colors + empty);
    draft = removed.some((tube) => tube.length > 0)
      ? emptyDraft(draft.colors, empty, draft.title)
      : {
          ...draft,
          empty,
          board: [
            ...draft.board.slice(0, draft.colors + empty),
            ...Array.from({ length: Math.max(0, empty - draft.empty) }, () => []),
          ],
        };
    renderEditor();
  };

  const tapTube = (index: number, element: HTMLElement) => {
    const tube = draft.board[index];
    if (!tube) return;
    if (pick === ERASER) {
      if (tube.length === 0) return shake(element);
      tube.pop();
    } else if (tube.length < CAP && countColor(draft.board, pick) < CAP) {
      tube.push(pick);
    } else {
      return shake(element);
    }
    renderEditor();
  };

  const selectPick = (color: number) => {
    pick = color;
    renderEditor();
  };

  const clearBoard = () => {
    draft = emptyDraft(draft.colors, draft.empty, draft.title);
    renderEditor();
  };

  const backToEditor = () => {
    unmountTest?.();
    unmountTest = null;
    renderEditor();
  };

  const renderEditor = () => {
    save();
    const palette = h(
      'div',
      { class: 'palette' },
      ...Array.from({ length: draft.colors }, (_, color) =>
        h(
          'button',
          {
            class: `swatch ${pick === color ? 'on' : ''}`,
            style: { background: COLORS[color] ?? '#000' },
            on: { click: () => selectPick(color) },
          },
          h('b', null, String(CAP - countColor(draft.board, color))),
        ),
      ),
      h(
        'button',
        {
          class: `swatch eraser ${pick === ERASER ? 'on' : ''}`,
          title: strings.eraser,
          on: { click: () => selectPick(ERASER) },
        },
        '⌫',
      ),
    );
    const boardHost = h('div', { class: 'board-host' });
    const title = h('input', {
      type: 'text',
      value: draft.title,
      placeholder: strings.titlePlaceholder,
      maxLength: 24,
    });
    title.addEventListener('input', () => {
      draft = { ...draft, title: cleanTitle(title.value) };
      save();
    });
    replaceChildren(
      host,
      stepper(strings.colors, draft.colors, setColors),
      stepper(strings.empties, draft.empty, setEmpty),
      h('p', { class: 'muted center small' }, strings.editorHelp),
      palette,
      boardHost,
      title,
      h(
        'div',
        { class: 'controls' },
        h(
          'button',
          {
            on: {
              click: () => {
                draft = { ...draft, board: generateBoard(draft.colors, draft.empty, Math.floor(Math.random() * 1e9)) };
                renderEditor();
              },
            },
          },
          strings.random,
        ),
        h('button', { on: { click: clearBoard } }, strings.clear),
      ),
      h('button', { class: 'primary', on: { click: startTest } }, strings.test),
    );
    renderBoard(boardHost, draft.board, { width: host.clientWidth || window.innerWidth, onTap: tapTube });
  };

  const startTest = () => {
    const problem = draftProblem(draft);
    if (problem) return toast(strings[problem]);
    const started = Date.now();
    const playHost = h('div');
    replaceChildren(
      host,
      h('button', { class: 'ghost', on: { click: backToEditor } }, strings.edit),
      h('p', { class: 'muted center small' }, strings.testing),
      playHost,
    );
    unmountTest = mountFiolesPlay(playHost, {
      start: draft.board,
      strings,
      onProgress: () => undefined,
      onWin: (replay) => {
        ctx
          .publish({ data: boardToString(draft.board), title: draft.title, replay, durationMs: Date.now() - started })
          .then(() => store.remove(DRAFT_KEY))
          .catch((error: unknown) => toast(errorMessage(error, PLATFORM_STRINGS[ctx.lang])));
      },
    });
  };

  renderEditor();
  return () => unmountTest?.();
}
