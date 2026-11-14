// Partie de Bouquets : on fait glisser une fleur jusqu'à un pot (ou on la touche, puis on touche le pot) ; elle se
// pose à la place libre la plus proche du doigt. La fleur prise est celle de la place visée dans la largeur du pot,
// pas celle dont l'image est sous le doigt : les images voisines se chevauchent. Chaque action est mémorisée pour
// produire le replay envoyé au serveur.

import { type BouquetsAction, encodeActions } from '../../../shared/games/bouquets/definition.ts';
import {
  applyMove,
  type Board,
  cloneBoard,
  frontOf,
  hasMove,
  isSolved,
  liveState,
  type Move,
  type ReadonlyBoard,
} from '../../../shared/games/bouquets/rules.ts';
import { h } from '../../platform/dom.ts';
import { mountPuzzleFrame } from '../puzzle-frame.ts';
import { preloadArt } from './art.ts';
import { bouquetBurst, FRONT_PLACES, potsOf, renderBoard } from './board.ts';
import type { BouquetsStrings } from './strings.ts';

export interface BouquetsPlayOptions {
  start: ReadonlyBoard;
  strings: BouquetsStrings;
  onProgress(update: { state: string; value: number; replay: string }): void;
  onWin(replay: string): void;
}

/** Déplacement du doigt, en pixels, au-delà duquel un toucher devient un glisser. */
const DRAG_THRESHOLD = 8;
/** Durée de l'envol d'un bouquet, en millisecondes. */
const BURST_MS = 800;
/** Durée du vol d'une fleur vers sa place, en millisecondes. */
const FLIGHT_MS = 260;

/** Parmi `places`, celle dont le centre est le plus proche de `clientX` dans la largeur du pot. */
function closestPlace(places: readonly number[], potRect: DOMRect, clientX: number): number | null {
  const fraction = (clientX - potRect.left) / potRect.width;
  const distance = (place: number) => Math.abs((FRONT_PLACES[place]?.[0] ?? 0.5) - fraction);
  let best: number | null = null;
  for (const place of places) if (best === null || distance(place) < distance(best)) best = place;
  return best;
}

/**
 * Place du devant visée par le doigt : chaque place couvre la partie du pot la plus proche de son centre, sur toute
 * sa hauteur. La première place si la position est inconnue.
 */
export function pointedPlace(potRect: DOMRect, clientX: number): number {
  if (potRect.width === 0) return 0;
  return (
    closestPlace(
      FRONT_PLACES.map((_, place) => place),
      potRect,
      clientX,
    ) ?? 0
  );
}

/**
 * Place libre du pot la plus proche de `clientX` (position du doigt), ou la première place libre si la position
 * est inconnue. `null` si le pot est plein.
 */
export function nearestFreePlace(front: readonly (number | null)[], potRect: DOMRect, clientX: number): number | null {
  const free = front.flatMap((slot, place) => (slot === null ? [place] : []));
  if (potRect.width === 0) return free[0] ?? null;
  return closestPlace(free, potRect, clientX);
}

const reducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Hit {
  pot: number;
  element: HTMLElement;
  /** Fleur de la place visée, `null` si cette place est libre. */
  flower: { slot: number; image: HTMLElement } | null;
}

/** Pot sous un élément du plateau, et fleur de la place visée à la position `clientX`. */
function locate(target: EventTarget | null, clientX: number): Hit | null {
  if (!(target instanceof Element)) return null;
  const element = target.closest<HTMLElement>('.bq-pot');
  if (!element) return null;
  const slot = pointedPlace(element.getBoundingClientRect(), clientX);
  const image = element.querySelector<HTMLElement>(`.bq-slot.front[data-place="${slot}"] .bq-flower`);
  return { pot: Number(element.getAttribute('data-pot')), element, flower: image ? { slot, image } : null };
}

export function mountBouquetsPlay(host: HTMLElement, options: BouquetsPlayOptions): () => void {
  const { strings } = options;
  preloadArt();
  let board: Board = cloneBoard(options.start);
  let actions: BouquetsAction[] = [];
  let history: Board[] = [];
  let lifted: { pot: number; slot: number } | null = null;
  let finished = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const {
    counter,
    table: boardHost,
    undo,
    restart,
  } = mountPuzzleFrame(host, {
    undoLabel: strings.undo,
    restartLabel: strings.restart,
    onUndo: () => undoLast(),
    onRestart: () => reset(),
  });
  boardHost.classList.add('bq-play');
  const hint = h('p', { class: 'bq-hint' }, strings.stuck);
  host.append(hint);

  const render = (revealed: readonly number[] = []) => {
    counter.textContent = strings.moves(actions.length);
    undo.disabled = history.length === 0 || finished;
    restart.disabled = finished;
    hint.hidden = finished || hasMove(board);
    renderBoard(boardHost, potsOf(board), {
      width: host.clientWidth || window.innerWidth,
      strings,
      lifted,
      revealed,
    });
  };

  const report = () =>
    options.onProgress({ state: liveState(board), value: actions.length, replay: encodeActions(actions) });

  const potElement = (pot: number) => boardHost.querySelector<HTMLElement>(`.bq-pot[data-pot="${pot}"]`);

  /** La fleur part de `from` (position à l'écran) et vole jusqu'à sa nouvelle place. */
  const fly = (from: DOMRect, move: Move) => {
    const image = potElement(move.to)?.querySelector<HTMLElement>(
      `.bq-slot.front[data-place="${move.place}"] .bq-flower`,
    );
    if (!image || reducedMotion() || typeof image.animate !== 'function') return;
    const to = image.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    image.animate(
      [
        { transform: `translate(${dx}px, ${dy}px)` },
        { transform: `translate(${dx / 2}px, ${dy / 2 - 30}px)`, offset: 0.5 },
        { transform: 'none' },
      ],
      { duration: FLIGHT_MS, easing: 'ease-out' },
    );
  };

  /** Les trois fleurs du bouquet se rassemblent au-dessus du pot puis s'envolent. */
  const burst = (pot: number, kind: number) => {
    const target = potElement(pot);
    if (!target || reducedMotion()) return;
    const rect = target.getBoundingClientRect();
    const overlay = bouquetBurst(kind, rect);
    document.body.append(overlay);
    const timer = setTimeout(() => {
      overlay.remove();
      timers.delete(timer);
    }, BURST_MS);
    timers.add(timer);
  };

  const play = (move: Move, from: DOMRect) => {
    const kind = frontOf(board[move.from] ?? [])[move.slot];
    const before = cloneBoard(board);
    const effect = applyMove(board, move);
    if (!effect || kind === undefined || kind === null) return;
    history.push(before);
    actions.push({ type: 'move', ...move });
    lifted = null;
    finished = isSolved(board);
    render(effect.revealed);
    if (effect.bouquet) burst(move.to, kind);
    else fly(from, move);
    report();
    if (finished) options.onWin(encodeActions(actions));
  };

  const shake = (element: HTMLElement) => {
    element.classList.remove('shake');
    void element.offsetWidth;
    element.classList.add('shake');
  };

  /** Pose la fleur `source` sur le pot visé, à la place libre la plus proche de `clientX`. */
  const drop = (
    source: { pot: number; slot: number },
    target: { pot: number; element: HTMLElement },
    clientX: number,
    from: DOMRect,
  ) => {
    const front = frontOf(board[target.pot] ?? []);
    const place =
      target.pot === source.pot ? null : nearestFreePlace(front, target.element.getBoundingClientRect(), clientX);
    if (place === null) {
      shake(target.element);
      return false;
    }
    play({ from: source.pot, slot: source.slot, to: target.pot, place }, from);
    return true;
  };

  const sourceRect = (source: { pot: number; slot: number }) =>
    potElement(source.pot)
      ?.querySelector(`.bq-slot.front[data-place="${source.slot}"] .bq-flower`)
      ?.getBoundingClientRect() ?? new DOMRect();

  /* ---------- Toucher, puis toucher ---------- */

  const tap = (event: MouseEvent) => {
    if (finished) return;
    const hit = locate(event.target, event.clientX);
    if (!hit) return;
    if (lifted) {
      if (hit.pot === lifted.pot && hit.flower?.slot === lifted.slot) {
        lifted = null;
        return render();
      }
      if (hit.pot !== lifted.pot && frontOf(board[hit.pot] ?? []).includes(null)) {
        drop(lifted, hit, event.clientX, sourceRect(lifted));
        return;
      }
    }
    if (hit.flower) {
      lifted = { pot: hit.pot, slot: hit.flower.slot };
      return render();
    }
    if (lifted) shake(hit.element);
  };

  /* ---------- Glisser-déposer ---------- */

  let pending: { pot: number; slot: number; x: number; y: number; image: HTMLElement } | null = null;
  let ghost: { element: HTMLElement; dx: number; dy: number } | null = null;
  let dragged = false;

  const onPointerDown = (event: PointerEvent) => {
    dragged = false;
    if (finished) return;
    const hit = locate(event.target, event.clientX);
    if (!hit?.flower) return;
    pending = { pot: hit.pot, slot: hit.flower.slot, x: event.clientX, y: event.clientY, image: hit.flower.image };
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!pending) return;
    if (!ghost) {
      if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) < DRAG_THRESHOLD) return;
      const rect = pending.image.getBoundingClientRect();
      const element = h('img', {
        class: 'bq-ghost',
        attrs: { src: pending.image.getAttribute('src') ?? '', alt: '' },
        style: { width: `${rect.width}px`, height: `${rect.height}px` },
      });
      document.body.append(element);
      ghost = { element, dx: pending.x - rect.left, dy: pending.y - rect.top };
      pending.image.classList.add('dragging');
      lifted = null;
    }
    event.preventDefault();
    ghost.element.style.transform = `translate(${event.clientX - ghost.dx}px, ${event.clientY - ghost.dy}px)`;
  };

  const endDrag = (event: PointerEvent) => {
    const source = pending;
    pending = null;
    if (!source || !ghost) return;
    dragged = true;
    const from = ghost.element.getBoundingClientRect();
    ghost.element.remove();
    ghost = null;
    source.image.classList.remove('dragging');
    const target = locate(document.elementFromPoint(event.clientX, event.clientY), event.clientX);
    if (!target || event.type === 'pointercancel' || !drop(source, target, event.clientX, from)) render();
  };

  // Un glisser se termine par un clic que le navigateur peut encore envoyer : il ne doit pas compter comme un toucher.
  const onClick = (event: MouseEvent) => {
    if (dragged) {
      dragged = false;
      return;
    }
    tap(event);
  };

  boardHost.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  boardHost.addEventListener('click', onClick);

  const undoLast = () => {
    const previous = history.pop();
    if (!previous || finished) return;
    board = previous;
    actions.push({ type: 'undo' });
    lifted = null;
    render();
    report();
  };

  const reset = () => {
    board = cloneBoard(options.start);
    actions = [];
    history = [];
    lifted = null;
    finished = false;
    render();
    report();
  };

  const onResize = () => render();
  window.addEventListener('resize', onResize);
  render();
  report();
  return () => {
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
    ghost?.element.remove();
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    for (const overlay of document.querySelectorAll('.bq-burst')) overlay.remove();
  };
}
