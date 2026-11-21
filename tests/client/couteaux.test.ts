import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { GameView } from '../../src/client/games/client-game.ts';
import { degrees, MINI_STAGE, renderMiniTarget, stageSide } from '../../src/client/games/couteaux/board.ts';
import type { Clock } from '../../src/client/games/couteaux/clock.ts';
import { smoothTurn, ticksBetween } from '../../src/client/games/couteaux/clock.ts';
import { couteauxClient } from '../../src/client/games/couteaux/index.ts';
import { mountCouteauxPlay } from '../../src/client/games/couteaux/play.ts';
import { mountCouteauxReplay } from '../../src/client/games/couteaux/replay.ts';
import { CLOSE_KNIVES, couteauxStatus } from '../../src/client/games/couteaux/status.ts';
import { COUTEAUX_STRINGS } from '../../src/client/games/couteaux/strings.ts';
import { createGameView } from '../../src/client/platform/context.ts';
import { encodeThrows } from '../../src/shared/games/couteaux/definition.ts';
import {
  FLIGHT_TICKS,
  GAP,
  LEVEL_COUNT,
  liveState,
  rotationOf,
  START,
  THROW_TICKS,
  TICK_MS,
  TICKS_PER_SECOND,
  TURN,
} from '../../src/shared/games/couteaux/rules.ts';
import type { GameState } from '../../src/shared/platform/protocol.ts';
import { couteauxLevel, couteauxLoss, couteauxWin } from '../support/couteaux.ts';

const ME = 'player1';
const fr = COUTEAUX_STRINGS.fr;
const level = couteauxLevel(1);
const win = couteauxWin(1);

/** Horloge pilotée par le test : `at(tick)` avance jusqu'au pas voulu et dessine une image. */
function fakeClock(): Clock & { at(tick: number): void; pending(): number } {
  let time = 0;
  let next = 1;
  const frames = new Map<number, () => void>();
  return {
    now: () => time,
    frame(callback) {
      const id = next++;
      frames.set(id, callback);
      return id;
    },
    cancel: (id) => frames.delete(id),
    at(tick) {
      time = tick * TICK_MS + 1;
      const due = [...frames.values()];
      frames.clear();
      for (const callback of due) callback();
    },
    pending: () => frames.size,
  };
}

function view(overrides: Partial<GameState> = {}): GameView {
  const state: GameState = {
    players: [{ id: ME, name: 'Moi', created: 1, avatar: null }],
    progress: [],
    records: {},
    lockedUntil: {},
    ...overrides,
  };
  return createGameView(state, ME, 'fr');
}

const mount = () => {
  const host = document.createElement('div');
  document.body.append(host);
  const clock = fakeClock();
  const onProgress = vi.fn();
  const onWin = vi.fn();
  const onLose = vi.fn();
  const unmount = mountCouteauxPlay(host, { level, number: 1, strings: fr, onProgress, onWin, onLose, clock });
  const stage = host.querySelector<HTMLElement>('.ct-stage');
  if (!stage) throw new Error('scène attendue');
  const tap = () => stage.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
  /** Lance au pas `tick`, puis laisse arriver le couteau. */
  const throwAt = (tick: number) => {
    clock.at(tick);
    tap();
    clock.at(tick + FLIGHT_TICKS);
  };
  return { host, stage, clock, onProgress, onWin, onLose, unmount, tap, throwAt };
};

const planted = (host: HTMLElement) => host.querySelectorAll('.ct-spin .ct-knife.mine').length;
const lives = (host: HTMLElement) => host.querySelector('.lives')?.textContent;
const left = (host: HTMLElement) => host.querySelector('.ct-left')?.textContent;

describe('jeu', () => {
  it('suit la campagne commune, score en erreurs, parfait sans erreur', () => {
    expect(couteauxClient.definition.id).toBe('couteaux');
    expect(couteauxClient.icon).toEqual({ kind: 'emoji', emoji: '🔪' });
    expect(couteauxClient.name).toEqual({ fr: 'Couteaux', zh: '飞刀' });
    expect(couteauxClient.formatValue?.(0, 'fr')).toBe('0 erreur');
    expect(couteauxClient.formatValue?.(2, 'fr')).toBe('2 erreurs');
    expect(couteauxClient.formatValue?.(2, 'zh')).toBe('失误 2 次');
    const v = view({ records: { 'c:1': [{ player: ME, value: 0, run: 'r1' }] } });
    expect(couteauxClient.levelProgress(v, ME)).toEqual({ current: 2, unlocked: 2, total: LEVEL_COUNT });
    expect(couteauxClient.levelTile(1, v)).toMatchObject({ status: 'done', perfect: true, recordPerfect: true });
    expect(couteauxClient.keyLabel('c:4', 'zh')).toBe('第 4 关');
    expect(couteauxClient.nextKey('c:19', v)).toBe('c:20');
    expect(couteauxClient.nextKey('c:20', v)).toBeNull();
    expect(couteauxClient.levelOf('c:21')).toBeNull();
  });

  it('montre la planète d’un autre joueur, ses vies et sa situation', () => {
    const state = liveState(1, { planted: [0, 1800], misses: 1, last: 10 });
    expect(couteauxClient.liveTag(state, 3, 'fr')).toBe('❤️❤️🖤');
    const mini = couteauxClient.renderLiveState(state);
    expect(mini?.querySelectorAll('.ct-knife.mine')).toHaveLength(2);
    expect(mini?.querySelector('.ct-shot')).toBeNull();
    expect(couteauxClient.liveStatus(state, 3)).toBe('far');
    for (const bad of ['x', liveState(LEVEL_COUNT + 1, START)]) {
      expect(couteauxClient.renderLiveState(bad)).toBeNull();
      expect(couteauxClient.liveStatus(bad, 0)).toBeNull();
    }
    expect(couteauxClient.liveTag('x', 0, 'fr')).toBeNull();
  });
});

describe('situation en direct', () => {
  it('distingue le départ, la fin toute proche, le chemin qui reste et l’impasse', () => {
    const live = (angles: number[]) => ({ level: 1, misses: 0, planted: angles });
    expect(couteauxStatus(level, live([]), 0)).toBe('start');
    expect(couteauxStatus(level, live([0]), 1)).toBe('far');
    const spread = (count: number) => Array.from({ length: count }, (_, i) => i * 3 * GAP);
    expect(couteauxStatus(level, live(spread(level.knives - CLOSE_KNIVES)), 9)).toBe('close');
    expect(couteauxStatus(level, live(spread(level.knives)), 9)).toBe('close');
    // Des couteaux tous les 1,5 écarts : plus aucune place entre eux.
    const crowded = Array.from({ length: Math.floor(TURN / (1.5 * GAP)) }, (_, i) => i * 1.5 * GAP);
    expect(couteauxStatus({ ...level, knives: 30 }, live(crowded), 9)).toBe('stuck');
  });
});

describe('scène', () => {
  it('tient dans la largeur, sans devenir minuscule ni encombrante', () => {
    expect(stageSide(100)).toBe(220);
    expect(stageSide(300)).toBe(300);
    expect(stageSide(2000)).toBe(360);
    expect(degrees(TURN / 4)).toBe(90);
  });

  it('dessine l’aperçu à sa taille, avec les obstacles du niveau', () => {
    const withObstacles = couteauxLevel(LEVEL_COUNT);
    const mini = renderMiniTarget(withObstacles, []);
    expect(mini.querySelectorAll('.ct-knife.obstacle')).toHaveLength(withObstacles.obstacles.length);
    expect(mini.querySelector<HTMLElement>('.ct-stage')?.style.getPropertyValue('--s')).toBe(`${MINI_STAGE}px`);
  });

  it('fait tourner la planète en douceur entre deux pas', () => {
    const rotation = rotationOf({ knives: 1, obstacles: [], spin: [{ ticks: 10, from: 10, to: 10 }] });
    expect(smoothTurn(rotation, 2.5)).toBe(25);
    expect(ticksBetween(0, 3 * TICK_MS)).toBeCloseTo(3);
    expect(ticksBetween(10, 0)).toBe(0);
  });
});

describe('partie', () => {
  it('annonce le départ : trois vies, tous les couteaux à planter, un bouton Recommencer', () => {
    const { host, onProgress } = mount();
    expect(onProgress).toHaveBeenCalledWith({ state: liveState(1, START), value: 0, replay: '' });
    expect(lives(host)).toBe('❤️❤️❤️');
    expect(left(host)).toBe(`🔪 ${level.knives}`);
    expect(host.querySelector('.ct-hint')?.textContent).toBe(fr.hint);
    expect([...host.querySelectorAll('.controls button')].map((button) => button.textContent)).toEqual([fr.restart]);
  });

  it('lance au toucher et plante le couteau à son arrivée seulement', () => {
    const { host, clock, tap, onProgress } = mount();
    const [first = 0] = win;
    clock.at(first);
    tap();
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ value: 1, replay: encodeThrows([first]) }));
    clock.at(first + FLIGHT_TICKS - 1);
    expect(planted(host)).toBe(0);
    clock.at(first + FLIGHT_TICKS);
    expect(planted(host)).toBe(1);
    expect(left(host)).toBe(`🔪 ${level.knives - 1}`);
  });

  it('attend entre deux lancers, sans couteau en attente pendant ce temps', () => {
    const { host, clock, tap, onProgress } = mount();
    const ready = () => host.querySelector<HTMLElement>('.ct-stage > .ct-shot:not(.bounce)')?.hidden;
    const flying = () => host.querySelectorAll('.ct-flights .ct-knife').length;
    const [first = 0] = win;
    clock.at(first);
    expect(ready()).toBe(false);
    tap();
    clock.at(first + 1);
    expect(flying()).toBe(1);
    expect(ready()).toBe(true);
    clock.at(first + THROW_TICKS - 1);
    tap();
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ value: 1 }));
    clock.at(first + THROW_TICKS);
    expect(ready()).toBe(false);
    tap();
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ value: 2 }));
    clock.at(first + THROW_TICKS + 1);
    expect(flying()).toBe(2);
    clock.at(first + FLIGHT_TICKS);
    expect(flying()).toBe(1);
  });

  it('gagne une fois le dernier couteau arrivé, sans autre lancer possible', () => {
    const { host, onWin, throwAt, tap, onProgress, clock } = mount();
    win.slice(0, -1).forEach(throwAt);
    const last = win[win.length - 1] ?? 0;
    clock.at(last);
    tap();
    expect(onWin).not.toHaveBeenCalled();
    clock.at(last + FLIGHT_TICKS);
    expect(onWin).toHaveBeenCalledWith(encodeThrows(win));
    expect(planted(host)).toBe(level.knives);
    expect(host.querySelector<HTMLButtonElement>('.controls button')?.disabled).toBe(true);
    expect(clock.pending()).toBe(0);
    const calls = onProgress.mock.calls.length;
    tap();
    expect(onProgress.mock.calls.length).toBe(calls);
  });

  it('perd une vie à chaque rebond et la partie au troisième', () => {
    const { host, onLose, throwAt } = mount();
    const loss = couteauxLoss(1);
    loss.slice(0, 2).forEach(throwAt);
    expect(lives(host)).toBe('❤️❤️🖤');
    expect(host.querySelector('.ct-stage > .bounce')).not.toBeNull();
    loss.slice(2).forEach(throwAt);
    expect(onLose).toHaveBeenCalledWith(encodeThrows(loss));
    expect(lives(host)).toBe('🖤🖤🖤');
  });

  it('lance à Espace, Entrée ou flèche haut, sauf en écrivant dans un champ', () => {
    const { clock, onProgress } = mount();
    clock.at(0);
    const input = document.createElement('input');
    document.body.append(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ value: 0 }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ value: 0 }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ value: 1 }));
    input.remove();
  });

  it('recommence de zéro, horloge comprise', () => {
    const { host, clock, throwAt, onProgress } = mount();
    const [first = 0] = win;
    throwAt(first);
    clock.at(500);
    host.querySelector<HTMLButtonElement>('.controls button')?.click();
    expect(onProgress).toHaveBeenLastCalledWith({ state: liveState(1, START), value: 0, replay: '' });
    expect(planted(host)).toBe(0);
    expect(left(host)).toBe(`🔪 ${level.knives}`);
    clock.at(500 + first);
    host.querySelector<HTMLElement>('.ct-stage')?.dispatchEvent(new PointerEvent('pointerdown', { button: 0 }));
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ replay: encodeThrows([first]) }));
  });

  it('s’arrête au démontage', () => {
    const { clock, unmount, onProgress } = mount();
    unmount();
    expect(clock.pending()).toBe(0);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(onProgress).toHaveBeenCalledTimes(1);
  });
});

describe('replay', () => {
  const mountReplay = (replay: string) => {
    const host = document.createElement('div');
    const clock = fakeClock();
    const stop = mountCouteauxReplay(host, level, replay, clock);
    const slider = host.querySelector<HTMLInputElement>('input[type=range]');
    const [first, play] = [...host.querySelectorAll<HTMLButtonElement>('.controls button')];
    if (!slider || !first || !play) throw new Error('commandes attendues');
    return { host, clock, stop, slider, first, play };
  };

  it('se place à n’importe quel instant de la partie', () => {
    const { host, slider } = mountReplay(encodeThrows(win));
    const end = Number(slider.max);
    expect(end).toBeGreaterThan((win[win.length - 1] ?? 0) + FLIGHT_TICKS);
    expect(planted(host)).toBe(0);
    slider.value = String(end);
    slider.dispatchEvent(new Event('input'));
    expect(planted(host)).toBe(level.knives);
    expect(left(host)).toBe('🔪 0');
  });

  it('montre les rebonds d’une partie perdue', () => {
    const { host, slider } = mountReplay(encodeThrows(couteauxLoss(1)));
    slider.value = slider.max;
    slider.dispatchEvent(new Event('input'));
    expect(planted(host)).toBe(1);
    expect(lives(host)).toBe('🖤🖤🖤');
  });

  it('se lit en temps réel, se met en pause et revient au début', () => {
    const { host, clock, play, first, slider, stop } = mountReplay(encodeThrows(win));
    clock.at(0);
    play.click();
    expect(play.textContent).toBe('⏸');
    clock.at((win[0] ?? 0) + FLIGHT_TICKS);
    expect(planted(host)).toBe(1);
    play.click();
    expect(play.textContent).toBe('▶');
    first.click();
    expect(slider.value).toBe('0');
    expect(planted(host)).toBe(0);
    play.click();
    clock.at(100_000);
    expect(play.textContent).toBe('▶');
    expect(planted(host)).toBe(level.knives);
    stop();
  });

  it('ignore la fin d’un replay illisible', () => {
    const { host, slider } = mountReplay('zz.!');
    expect(slider.max).toBe(String(TICKS_PER_SECOND));
    expect(planted(host)).toBe(0);
  });
});

/** Déclarations de la règle `selector` de la feuille de style du site (chemin depuis la racine, où tourne Vitest). */
function cssRule(selector: string): string {
  const css = readFileSync('site/style.css', 'utf8');
  const start = css.indexOf(`\n${selector} {`);
  return start < 0 ? '' : css.slice(start, css.indexOf('}', start));
}

describe('feuille de style de Couteaux', () => {
  // Sans calque à part, Safari repeint la planète et le fond à chaque image : la partie saccade.
  it('anime la planète et le couteau lancé chacun sur son calque', () => {
    expect(cssRule('.ct-spin')).toContain('will-change: transform');
    expect(cssRule('.ct-knife.ct-shot')).toContain('will-change: transform');
  });
});
