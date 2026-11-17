import { describe, expect, it, vi } from 'vitest';
import type { GameView } from '../../src/client/games/client-game.ts';
import {
  cellSize,
  MIN_CELL,
  renderMiniParking,
  renderParking,
  vehicleColor,
} from '../../src/client/games/parking/board.ts';
import { parkingClient } from '../../src/client/games/parking/index.ts';
import { mountParkingPlay } from '../../src/client/games/parking/play.ts';
import { mountParkingReplay } from '../../src/client/games/parking/replay.ts';
import { parkingStatus } from '../../src/client/games/parking/status.ts';
import { PARKING_STRINGS } from '../../src/client/games/parking/strings.ts';
import { createGameView } from '../../src/client/platform/context.ts';
import { MAX_LEVEL } from '../../src/shared/games/campaign.ts';
import { encodeActions, type ParkingAction, parking } from '../../src/shared/games/parking/definition.ts';
import { LEVELS } from '../../src/shared/games/parking/levels.ts';
import { OPTIMAL } from '../../src/shared/games/parking/optimal.ts';
import { type Board, boardToString, slide, slideRange } from '../../src/shared/games/parking/rules.ts';
import type { GameState } from '../../src/shared/platform/protocol.ts';
import { parkingLevel, parkingSolution, parkingWin } from '../support/parking.ts';

const ME = 'player1';
const fr = PARKING_STRINGS.fr;
const start = parkingLevel(1);
const win = parkingWin(1);

function view(overrides: Partial<GameState> = {}): GameView {
  const state: GameState = {
    players: [{ id: ME, name: 'Moi', created: 1, avatar: null }],
    progress: [],
    records: {},
    ...overrides,
  };
  return createGameView(state, ME, 'fr');
}

const vehicles = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('.pk-car')];
const vehicle = (host: HTMLElement, index: number) =>
  host.querySelector<HTMLButtonElement>(`[data-vehicle="${index}"]`) ?? undefined;
const counter = (host: HTMLElement) => host.querySelector('.counter')?.textContent;
const button = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('.controls button')].find((b) => b.textContent === label);

/** Côté d'une case du parking affiché, en pixels. */
const side = (host: HTMLElement) =>
  Number.parseFloat(host.querySelector<HTMLElement>('.pk-lot')?.style.getPropertyValue('--cs') ?? '');

/** Glisse un véhicule du doigt de `cells` cases (fractions permises) le long de son axe, puis le lâche. */
function drag(
  host: HTMLElement,
  board: Board,
  index: number,
  cells: number,
  end: 'pointerup' | 'pointercancel' = 'pointerup',
) {
  const horizontal = board[index]?.horizontal ?? true;
  const offset = cells * side(host);
  vehicle(host, index)?.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: 100, clientY: 100 }),
  );
  window.dispatchEvent(
    new PointerEvent('pointermove', {
      pointerId: 1,
      clientX: horizontal ? 100 + offset : 100,
      clientY: horizontal ? 100 : 100 + offset,
    }),
  );
  window.dispatchEvent(new PointerEvent(end, { pointerId: 1 }));
}

/** Joue des glissements du doigt, une case de déplacement à chaque fois exactement. */
function playSlides(host: HTMLElement, actions: readonly ParkingAction[]) {
  let board = start;
  for (const action of actions) {
    if (action.type !== 'slide') continue;
    drag(host, board, action.vehicle, action.delta);
    board = slide(board, action) ?? board;
  }
}

const mount = () => {
  const host = document.createElement('div');
  document.body.append(host);
  const onProgress = vi.fn();
  const onWin = vi.fn();
  const unmount = mountParkingPlay(host, { start, strings: fr, onProgress, onWin });
  return { host, onProgress, onWin, unmount };
};

describe('jeu', () => {
  it('suit la campagne commune, score en coups et 💎 au meilleur score possible', () => {
    expect(parkingClient.definition.id).toBe('parking');
    expect(parkingClient.icon).toEqual({ kind: 'emoji', emoji: '🚗' });
    const v = view({ records: { 'c:1': [{ player: ME, value: OPTIMAL[0] ?? 0, run: 'r1' }] } });
    expect(parkingClient.levelProgress(v, ME)).toEqual({ unlocked: 2, total: MAX_LEVEL });
    expect(parkingClient.levelTile(1, v)).toMatchObject({ status: 'done', perfect: true, recordPerfect: true });
    expect(parkingClient.levelTile(2, v).status).toBe('open');
    expect(parkingClient.keyLabel('c:5', 'zh')).toBe('第 5 关');
    expect(parkingClient.formatValue?.(1, 'fr')).toBe('1 coup');
    expect(parkingClient.formatValue?.(12, 'zh')).toBe('12 步');
  });

  it('a les mêmes textes dans chaque langue', () => {
    expect(Object.keys(PARKING_STRINGS.zh).sort()).toEqual(Object.keys(fr).sort());
  });

  it('montre l’aperçu d’un joueur en direct, et rien pour un état illisible', () => {
    const preview = parkingClient.renderLiveState(LEVELS[0] ?? '');
    expect(preview?.classList.contains('pk-mini')).toBe(true);
    expect(preview?.querySelectorAll('.pk-car')).toHaveLength(start.length);
    expect(preview?.querySelector('button')).toBeNull();
    expect(parkingClient.renderLiveState('n’importe quoi')).toBeNull();
    expect(parkingClient.liveStatus('n’importe quoi', 1)).toBeNull();
    expect(parkingClient.liveStatus(LEVELS[0] ?? '', 0)).toBe('start');
  });

  it('affiche un point d’interrogation pour une clé inconnue', () => {
    const host = document.createElement('div');
    parkingClient.mountPlay(host, { key: 'x:1', lang: 'fr', progress: vi.fn(), finish: vi.fn() });
    expect(host.textContent).toBe('?');
    parkingClient.mountReplay(host, { key: 'x:1', replay: '', lang: 'fr' })();
  });
});

describe('parking', () => {
  it('borne le côté des cases à la place disponible', () => {
    expect(cellSize(2000)).toBe(58);
    expect(cellSize(300)).toBe(50);
    expect(cellSize(100)).toBe(MIN_CELL);
    expect(cellSize(60, 8)).toBe(10);
  });

  it('dessine chaque véhicule à sa place, la voiture rouge en rouge, et la sortie', () => {
    const host = document.createElement('div');
    renderParking(host, start, { width: 360, strings: fr });
    expect(vehicles(host)).toHaveLength(start.length);
    expect(host.querySelector('.pk-exit')).not.toBeNull();
    const red = vehicle(host, 0);
    expect(red?.classList.contains('pk-red')).toBe(true);
    expect(red?.style.getPropertyValue('--paint')).toBe(vehicleColor(0));
    expect(red?.style.getPropertyValue('--r')).toBe(String(start[0]?.row));
    expect(red?.getAttribute('aria-label')).toBe('Voiture rouge, gauche-droite');
    expect(vehicle(host, 1)?.getAttribute('aria-label')).toMatch(/^Véhicule, /);
    expect(new Set(start.map((_, index) => vehicleColor(index))).size).toBe(start.length);
  });

  it('fait un aperçu non touchable', () => {
    const mini = renderMiniParking(start);
    expect(mini.querySelector('[data-vehicle]')).toBeNull();
    expect(side(mini)).toBe(22);
  });
});

describe('partie', () => {
  it('signale le parking de départ dès le montage, avec Recommencer et Annuler', () => {
    const { host, onProgress } = mount();
    expect(onProgress).toHaveBeenCalledWith({ state: LEVELS[0], value: 0, replay: '' });
    expect(counter(host)).toBe('0 coups');
    expect(button(host, fr.undo)?.disabled).toBe(true);
    expect(host.querySelector('.pk-hint')?.textContent).toBe(fr.hint);
  });

  it('fait glisser un véhicule du doigt et compte un coup, quelle que soit la distance', () => {
    const { host, onProgress } = mount();
    const [first] = win;
    if (first?.type !== 'slide') throw new Error('glissement attendu');
    drag(host, start, first.vehicle, first.delta);
    expect(counter(host)).toBe('1 coup');
    const after = slide(start, first);
    expect(onProgress).toHaveBeenLastCalledWith({
      state: after && boardToString(after),
      value: 1,
      replay: encodeActions([first]),
    });
    expect(vehicle(host, first.vehicle)?.style.transform).toBe('');
  });

  it('arrête le véhicule contre un obstacle et le range sur la case la plus proche', () => {
    const { host, onProgress } = mount();
    const index = start.findIndex((_, i) => slideRange(start, i).max > 0);
    const { max } = slideRange(start, index);
    drag(host, start, index, max + 3.2);
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ replay: encodeActions([{ type: 'slide', vehicle: index, delta: max }]) }),
    );
  });

  it('ne compte rien pour un geste trop court, interrompu ou sur le sol', () => {
    const { host, onProgress } = mount();
    const index = start.findIndex((_, i) => slideRange(start, i).max > 0);
    const calls = onProgress.mock.calls.length;
    drag(host, start, index, 0.4);
    drag(host, start, index, 1, 'pointercancel');
    host.querySelector('.pk-lot')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    window.dispatchEvent(new PointerEvent('pointerup'));
    expect(onProgress).toHaveBeenCalledTimes(calls);
    expect(counter(host)).toBe('0 coups');
  });

  it('suit le véhicule tenu pendant le geste', () => {
    const { host } = mount();
    const index = start.findIndex((_, i) => slideRange(start, i).max > 0);
    const horizontal = start[index]?.horizontal;
    vehicle(host, index)?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 2 }));
    expect(vehicle(host, index)?.classList.contains('pk-held')).toBe(true);
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 2, clientX: 29, clientY: 29 }));
    expect(vehicle(host, index)?.style.transform).toBe(horizontal ? 'translateX(29px)' : 'translateY(29px)');
    window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 2 }));
    expect(vehicle(host, index)?.classList.contains('pk-held')).toBe(false);
  });

  it('déplace d’une case aux flèches du clavier le véhicule qui a le focus, dans son axe seulement', () => {
    const { host } = mount();
    const index = start.findIndex((_, i) => slideRange(start, i).max > 0);
    const horizontal = start[index]?.horizontal;
    const press = (key: string) =>
      vehicle(host, index)?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    press(horizontal ? 'ArrowDown' : 'ArrowRight');
    expect(counter(host)).toBe('0 coups');
    press(horizontal ? 'ArrowRight' : 'ArrowDown');
    expect(counter(host)).toBe('1 coup');
    expect(document.activeElement).toBe(vehicle(host, index));
  });

  it('annule le dernier coup et recommence', () => {
    const { host, onProgress } = mount();
    const [first] = win;
    if (first?.type !== 'slide') throw new Error('glissement attendu');
    drag(host, start, first.vehicle, first.delta);
    button(host, fr.undo)?.click();
    expect(counter(host)).toBe('0 coups');
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: LEVELS[0], value: 0, replay: `${encodeActions([first])}u` }),
    );
    drag(host, start, first.vehicle, first.delta);
    button(host, fr.restart)?.click();
    expect(onProgress).toHaveBeenLastCalledWith({ state: LEVELS[0], value: 0, replay: '' });
  });

  it('gagne quand la voiture rouge touche la sortie, puis ignore les gestes', () => {
    const { host, onWin, onProgress } = mount();
    playSlides(host, win);
    expect(onWin).toHaveBeenCalledExactlyOnceWith(encodeActions(win));
    expect(parking.replay('c:1', encodeActions(win))).toEqual({ finished: true, value: OPTIMAL[0] });
    expect(host.querySelector('.pk-red')?.classList.contains('pk-leaving')).toBe(true);
    expect(host.querySelector('[data-vehicle]')).toBeNull();
    expect(button(host, fr.undo)?.disabled).toBe(true);
    expect(button(host, fr.restart)?.disabled).toBe(true);
    const calls = onProgress.mock.calls.length;
    button(host, fr.undo)?.click();
    expect(onProgress).toHaveBeenCalledTimes(calls);
  });

  it('se démonte sans laisser d’écouteur', () => {
    const { host, unmount, onProgress } = mount();
    unmount();
    const calls = onProgress.mock.calls.length;
    const [first] = win;
    if (first?.type !== 'slide') throw new Error('glissement attendu');
    drag(host, start, first.vehicle, first.delta);
    expect(onProgress).toHaveBeenCalledTimes(calls);
  });
});

describe('replay', () => {
  it('rejoue le chemin final, sans les coups annulés, jusqu’à la sortie', () => {
    const [first] = win;
    if (!first) throw new Error('coup attendu');
    const host = document.createElement('div');
    const stop = mountParkingReplay(host, start, encodeActions([first, { type: 'undo' }, ...win]), fr);
    const slider = host.querySelector<HTMLInputElement>('input[type=range]');
    expect(slider?.max).toBe(String(win.length));
    expect(counter(host)).toBe(`0 coups / ${win.length}`);
    if (slider) {
      slider.value = String(win.length);
      slider.dispatchEvent(new Event('input'));
    }
    expect(counter(host)).toBe(`${win.length} coups / ${win.length}`);
    expect(host.querySelector('.pk-red')?.classList.contains('pk-leaving')).toBe(true);
    stop();
  });

  it('lit automatiquement les coups', () => {
    vi.useFakeTimers();
    const host = document.createElement('div');
    const stop = mountParkingReplay(host, start, encodeActions(win), fr);
    const play = host.querySelector<HTMLButtonElement>('.btn.primary');
    play?.click();
    expect(play?.textContent).toBe('⏸');
    vi.advanceTimersByTime(700 * win.length);
    expect(counter(host)).toBe(`${win.length} coups / ${win.length}`);
    expect(play?.textContent).toBe('▶');
    stop();
    vi.useRealTimers();
  });

  it('montre le parking de départ pour un replay illisible', () => {
    const host = document.createElement('div');
    mountParkingReplay(host, start, 'zz', fr)();
    expect(host.querySelector<HTMLInputElement>('input[type=range]')?.max).toBe('0');
  });
});

describe('situation en direct', () => {
  it('distingue le départ, la sortie toute proche et le chemin qui reste', () => {
    expect(parkingStatus(start, 0)).toBe('start');
    // Niveau 1 : deux coups suffisent.
    expect(parkingStatus(start, 1)).toBe('close');
    const hard = parkingLevel(MAX_LEVEL);
    expect(parkingStatus(hard, 1)).toBe('far');
    const solved = parkingSolution(hard).reduce<Board>(
      (board, action) => (action.type === 'slide' ? (slide(board, action) ?? board) : board),
      hard,
    );
    expect(parkingStatus(solved, 30)).toBe('close');
  });
});
