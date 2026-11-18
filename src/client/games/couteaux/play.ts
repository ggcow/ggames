// Partie de Couteaux : un toucher (ou Espace, Entrée, flèche haut) lance un couteau vers la planète qui tourne.
// Il s'y plante, ou rebondit sur un couteau déjà planté et coûte une vie ; la troisième erreur perd la partie.
// Le pas de chaque lancer forme le replay envoyé au serveur, qui en déduit les mêmes couteaux plantés.

import { encodeThrows } from '../../../shared/games/couteaux/definition.ts';
import {
  canThrow,
  FLIGHT_TICKS,
  isLost,
  isWon,
  type Level,
  LIVES,
  liveState,
  rotationOf,
  START,
  type Throws,
  throwKnife,
} from '../../../shared/games/couteaux/rules.ts';
import { h } from '../../platform/dom.ts';
import { frameButton, livesBadge, livesText, mountPuzzleFrame } from '../puzzle-frame.ts';
import {
  bounceKnife,
  clearKnives,
  mountStage,
  placeFlights,
  plantKnife,
  type Stage,
  showReady,
  stageSide,
  turnPlanet,
} from './board.ts';
import { browserClock, type Clock, smoothTurn, ticksBetween } from './clock.ts';
import type { CouteauxStrings } from './strings.ts';

export interface CouteauxPlayOptions {
  level: Level;
  /** Numéro du niveau, diffusé avec l'état de la partie. */
  number: number;
  strings: CouteauxStrings;
  onProgress(update: { state: string; value: number; replay: string }): void;
  onWin(replay: string): void;
  onLose(replay: string): void;
  clock?: Clock;
}

/** Couteau lancé, pas encore arrivé à l'écran. */
interface Flight {
  thrown: number;
  arrival: number;
  angle: number;
  bounced: boolean;
}

/** Touches qui lancent un couteau. */
const THROW_KEYS = new Set([' ', 'Enter', 'ArrowUp']);

/** Vrai si la touche est tapée dans un champ (le salon, par exemple) : elle ne lance rien. */
const typing = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLElement && target.isContentEditable);

export function mountCouteauxPlay(host: HTMLElement, options: CouteauxPlayOptions): () => void {
  const { level, strings } = options;
  const clock = options.clock ?? browserClock;
  const rotation = rotationOf(level);
  let throws: Throws = START;
  let ticks: number[] = [];
  let flights: Flight[] = [];
  /** Couteaux arrivés à l'écran : plantés ou rebondis. */
  let shown: Throws = START;
  let startedAt = clock.now();
  let ended = false;
  let frame: number | null = null;

  const lives = livesBadge();
  const restart = frameButton(strings.restart, () => reset());
  const table = mountPuzzleFrame(host, { badge: lives, buttons: [restart] });
  host.append(h('p', { class: 'ct-hint' }, strings.hint));
  const stage: Stage = mountStage(table, level, stageSide((host.clientWidth || window.innerWidth) - 16));
  stage.root.setAttribute('role', 'button');
  stage.root.setAttribute('aria-label', strings.target);

  const finished = () => isWon(level, throws) || isLost(throws);

  const renderCounters = () => {
    lives.textContent = livesText(shown.misses, LIVES);
    lives.setAttribute('aria-label', strings.lives(LIVES - shown.misses));
    const left = level.knives - shown.planted.length;
    stage.left.textContent = `🔪 ${left}`;
    stage.left.setAttribute('aria-label', strings.left(left));
    restart.disabled = finished();
  };

  const report = () =>
    options.onProgress({ state: liveState(options.number, throws), value: ticks.length, replay: encodeThrows(ticks) });

  /** Montre les couteaux arrivés au pas `tick`, et termine la partie quand le dernier est arrivé. */
  const land = (tick: number) => {
    while (flights[0] && flights[0].arrival <= tick) {
      const flight = flights.shift() as Flight;
      if (flight.bounced) {
        shown = { ...shown, misses: shown.misses + 1 };
        bounceKnife(stage);
      } else {
        shown = { ...shown, planted: [...shown.planted, flight.angle] };
        plantKnife(stage, flight.angle);
      }
      renderCounters();
    }
    if (flights.length > 0 || ended || !finished()) return;
    ended = true;
    if (isWon(level, throws)) options.onWin(encodeThrows(ticks));
    else options.onLose(encodeThrows(ticks));
  };

  const draw = () => {
    frame = null;
    const elapsed = ticksBetween(startedAt, clock.now());
    const tick = Math.floor(elapsed);
    land(tick);
    turnPlanet(stage, smoothTurn(rotation, elapsed));
    placeFlights(
      stage,
      flights.map((flight) => (elapsed - flight.thrown) / FLIGHT_TICKS),
    );
    showReady(stage, canThrow(level, throws, tick));
    if (!ended) frame = clock.frame(draw);
  };

  const throwNow = () => {
    if (finished()) return;
    const tick = Math.floor(ticksBetween(startedAt, clock.now()));
    const result = throwKnife(level, rotation, throws, tick);
    if (!result) return;
    throws = result.throws;
    ticks.push(tick);
    flights.push({ thrown: tick, arrival: result.arrival, angle: result.angle, bounced: result.bounced });
    renderCounters();
    report();
  };

  const reset = () => {
    if (finished()) return;
    throws = START;
    shown = START;
    ticks = [];
    flights = [];
    startedAt = clock.now();
    clearKnives(stage);
    renderCounters();
    report();
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    throwNow();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (!THROW_KEYS.has(event.key) || typing(event.target) || event.repeat) return;
    event.preventDefault();
    throwNow();
  };
  stage.root.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('keydown', onKeyDown);

  renderCounters();
  report();
  draw();
  return () => {
    if (frame !== null) clock.cancel(frame);
    window.removeEventListener('keydown', onKeyDown);
  };
}
