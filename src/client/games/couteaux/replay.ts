// Lecteur de replay : rejoue une partie en temps réel, planète, lancers et rebonds compris, avec une barre pour
// se placer à n'importe quel instant.

import { decodeThrows } from '../../../shared/games/couteaux/definition.ts';
import {
  FLIGHT_TICKS,
  type Level,
  LIVES,
  rotationOf,
  START,
  type Throw,
  TICKS_PER_SECOND,
  throwKnife,
} from '../../../shared/games/couteaux/rules.ts';
import { h, replaceChildren } from '../../platform/dom.ts';
import { livesBadge, livesText } from '../puzzle-frame.ts';
import { clearKnives, mountStage, placeShot, plantKnife, stageSide, turnPlanet } from './board.ts';
import { browserClock, type Clock, smoothTurn, ticksBetween } from './clock.ts';

/** Pas montrés après le dernier couteau arrivé, pour voir la fin de la partie. */
const TAIL = TICKS_PER_SECOND;

/** Lancers d'un replay, rejoués : arrêtés au premier lancer impossible. */
function replayThrows(level: Level, replay: string): Throw[] {
  const rotation = rotationOf(level);
  const done: Throw[] = [];
  let throws = START;
  for (const tick of decodeThrows(replay) ?? []) {
    const next = throwKnife(level, rotation, throws, tick);
    if (!next) break;
    done.push(next);
    throws = next.throws;
  }
  return done;
}

export function mountCouteauxReplay(
  host: HTMLElement,
  level: Level,
  replay: string,
  clock: Clock = browserClock,
): () => void {
  const rotation = rotationOf(level);
  const done = replayThrows(level, replay);
  const end = (done[done.length - 1]?.arrival ?? 0) + TAIL;
  let at = 0;
  let playing: { since: number; from: number } | null = null;
  let frame: number | null = null;
  let landed = -1;

  const lives = livesBadge();
  const stageHost = h('div', { class: 'board-host' });
  const slider = h('input', { type: 'range', attrs: { min: '0', max: String(end), value: '0' } });
  const playButton = h('button', { class: 'btn primary' });
  replaceChildren(
    host,
    h('div', { class: 'table' }, lives, stageHost),
    slider,
    h('div', { class: 'controls' }, h('button', { class: 'btn', on: { click: () => jump(0) } }, '⏮'), playButton),
  );
  const stage = mountStage(stageHost, level, stageSide((host.clientWidth || window.innerWidth) - 16));

  const render = () => {
    const arrived = done.filter((step) => step.arrival <= at);
    if (arrived.length !== landed) {
      landed = arrived.length;
      clearKnives(stage);
      for (const step of arrived) if (!step.bounced) plantKnife(stage, step.angle);
    }
    const misses = arrived.filter((step) => step.bounced).length;
    lives.textContent = livesText(misses, LIVES);
    const flying = done.find((step) => step.arrival - FLIGHT_TICKS <= at && at < step.arrival);
    placeShot(stage, flying ? (at - (flying.arrival - FLIGHT_TICKS)) / FLIGHT_TICKS : 0);
    turnPlanet(stage, smoothTurn(rotation, at));
    stage.left.textContent = `🔪 ${level.knives - arrived.length + misses}`;
    slider.value = String(Math.floor(at));
    playButton.textContent = playing ? '⏸' : '▶';
  };

  const tick = () => {
    frame = null;
    if (!playing) return;
    at = Math.min(end, playing.from + ticksBetween(playing.since, clock.now()));
    if (at >= end) playing = null;
    render();
    if (playing) frame = clock.frame(tick);
  };

  const stop = () => {
    playing = null;
    if (frame !== null) clock.cancel(frame);
    frame = null;
  };

  function jump(target: number) {
    stop();
    at = Math.max(0, Math.min(end, target));
    render();
  }

  const toggle = () => {
    if (playing) {
      stop();
      return render();
    }
    if (at >= end) at = 0;
    playing = { since: clock.now(), from: at };
    render();
    frame = clock.frame(tick);
  };

  slider.addEventListener('input', () => jump(Number(slider.value)));
  playButton.addEventListener('click', toggle);
  render();
  return stop;
}
