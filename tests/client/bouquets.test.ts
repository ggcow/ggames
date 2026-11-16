import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLOWER_ART, ICON } from '../../src/client/games/bouquets/art.ts';
import {
  FRONT_PLACES,
  livePots,
  MIN_POT,
  MINI_WIDTH,
  potsOf,
  potWidth,
  renderBoard,
  renderMiniBoard,
} from '../../src/client/games/bouquets/board.ts';
import { bouquetsClient } from '../../src/client/games/bouquets/index.ts';
import { mountBouquetsPlay, nearestFreePlace, pointedPlace } from '../../src/client/games/bouquets/play.ts';
import { mountBouquetsReplay } from '../../src/client/games/bouquets/replay.ts';
import { potsStatus } from '../../src/client/games/bouquets/status.ts';
import { BOUQUETS_STRINGS } from '../../src/client/games/bouquets/strings.ts';
import type { GameView } from '../../src/client/games/client-game.ts';
import { createGameView } from '../../src/client/platform/context.ts';
import { bouquets, encodeActions } from '../../src/shared/games/bouquets/definition.ts';
import { type Board, FLOWER_KINDS, liveState } from '../../src/shared/games/bouquets/rules.ts';
import { MAX_LEVEL } from '../../src/shared/games/campaign.ts';
import type { GameState } from '../../src/shared/platform/protocol.ts';
import { bouquetsLevel, bouquetsWin } from '../support/bouquets.ts';

const ME = 'player1';
const OTHER = 'player2';
const _ = null;
const fr = BOUQUETS_STRINGS.fr;

function view(overrides: Partial<GameState> = {}): GameView {
  const state: GameState = {
    players: [
      { id: ME, name: 'Moi', created: 1 },
      { id: OTHER, name: 'Ami', created: 2 },
    ],
    progress: [],
    records: {},
    ...overrides,
  };
  return createGameView(state, ME, 'fr');
}

const pots = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('.bq-pot')];
const flowerIn = (host: HTMLElement, pot: number, slot: number) =>
  pots(host)[pot]?.querySelector<HTMLElement>(`.bq-slot.front[data-place="${slot}"] .bq-flower`);

describe('jeu', () => {
  it('se présente avec son icône peinte et une image par espèce', () => {
    expect(bouquetsClient.definition.id).toBe('bouquets');
    expect(bouquetsClient.icon).toEqual({ kind: 'image', src: ICON });
    expect(FLOWER_ART).toHaveLength(FLOWER_KINDS);
    expect(new Set(FLOWER_ART).size).toBe(FLOWER_KINDS);
  });

  it('suit la campagne commune : progression, cases, noms et niveau suivant', () => {
    const v = view({ records: { 'c:1': [{ player: ME, value: 12, run: 'r1' }] } });
    expect(bouquetsClient.levelProgress(v, ME)).toEqual({ unlocked: 2, total: MAX_LEVEL });
    expect(bouquetsClient.levelTile(1, v)).toEqual({ key: 'c:1', label: '1', status: 'done', best: '12 coups' });
    expect(bouquetsClient.levelTile(3, v).status).toBe('locked');
    expect(bouquetsClient.keyLabel('c:5', 'fr')).toBe('Niveau 5');
    expect(bouquetsClient.keyLabel('c:5', 'zh')).toBe('第 5 关');
    expect(bouquetsClient.nextKey('c:5', v)).toBe('c:6');
    expect(bouquetsClient.nextKey('c:100', v)).toBeNull();
    expect(bouquetsClient.formatValue?.(1, 'fr')).toBe('1 coup');
  });

  it('a les mêmes textes dans chaque langue et nomme chaque fleur', () => {
    expect(Object.keys(BOUQUETS_STRINGS.zh).sort()).toEqual(Object.keys(fr).sort());
    for (let kind = 0; kind < FLOWER_KINDS; kind++) {
      expect(fr.flower(kind)).not.toBe('?');
      expect(BOUQUETS_STRINGS.zh.flower(kind)).not.toBe('?');
    }
  });
});

describe('plateau', () => {
  const board: Board = [
    [
      [0, _, 1],
      [2, 3, 4],
    ],
    [[5, 5, _]],
  ];

  it('montre l’ombre de la couche suivante seulement aux places libres du devant', () => {
    const host = document.createElement('div');
    renderBoard(host, potsOf(board), { width: 390, strings: fr });
    const [first, second] = pots(host);
    expect([...(first?.querySelectorAll('.bq-slot.next') ?? [])].map((s) => s.getAttribute('data-place'))).toEqual([
      '1',
    ]);
    expect(first?.querySelector('.bq-slot.next .bq-flower')?.getAttribute('alt')).toBe('rose');
    expect(second?.querySelectorAll('.bq-slot.next')).toHaveLength(0);
  });

  it('nomme les fleurs du devant et marque les places occupées', () => {
    const host = document.createElement('div');
    renderBoard(host, potsOf(board), { width: 390, strings: fr });
    expect(flowerIn(host, 0, 0)?.getAttribute('alt')).toBe('pivoine');
    expect(flowerIn(host, 0, 1)).toBeNull();
    expect(pots(host)[0]?.querySelectorAll('.bq-slot.front.filled')).toHaveLength(2);
  });

  it('affiche le médaillon des couches cachées seulement s’il en reste', () => {
    const host = document.createElement('div');
    renderBoard(host, potsOf(board), { width: 390, strings: fr });
    expect(pots(host)[0]?.querySelector('.bq-badge')?.textContent).toBe('1');
    expect(pots(host)[0]?.querySelector('.bq-badge')?.getAttribute('aria-label')).toBe('1 couche cachée');
    expect(pots(host)[1]?.querySelector('.bq-badge')).toBeNull();
  });

  it('range trois pots par rangée et soulève la fleur touchée', () => {
    const host = document.createElement('div');
    const seven = Array.from({ length: 7 }, () => [[0, _, _]]);
    renderBoard(host, potsOf(seven), { width: 390, lifted: { pot: 4, slot: 0 } });
    expect([...host.querySelectorAll('.bq-row')].map((row) => row.children.length)).toEqual([3, 3, 1]);
    expect(host.querySelectorAll('.bq-slot.lifted')).toHaveLength(1);
    expect(pots(host)[4]?.querySelector('.bq-slot.lifted')).not.toBeNull();
  });

  it('garde des pots assez larges pour le doigt, sauf sur un aperçu', () => {
    expect(potWidth(200)).toBe(MIN_POT);
    expect(potWidth(2000)).toBe(120);
    expect(potWidth(MINI_WIDTH, 24, 4)).toBe(34);
  });

  it('dessine un aperçu de quatre pots par rangée, sans ombre de couche inconnue', () => {
    const empty = Array.from({ length: 5 }, () => ({ front: [_, _, _], hidden: 0 }));
    const mini = renderMiniBoard(livePots([{ front: [0, _, 1], hidden: 2 }, ...empty]));
    expect([...mini.querySelectorAll('.bq-row')].map((row) => row.children.length)).toEqual([4, 2]);
    expect(mini.querySelectorAll('.bq-slot.next')).toHaveLength(0);
    expect(mini.querySelector('.bq-badge')?.textContent).toBe('2');
  });
});

describe('places visées', () => {
  const rect = new DOMRect(100, 0, 100, 200);

  it('vise la place dont le centre est le plus proche, sur toute la largeur du pot', () => {
    expect(pointedPlace(rect, 100)).toBe(0);
    expect(pointedPlace(rect, 134)).toBe(0);
    expect(pointedPlace(rect, 136)).toBe(1);
    expect(pointedPlace(rect, 150)).toBe(1);
    expect(pointedPlace(rect, 164)).toBe(1);
    expect(pointedPlace(rect, 166)).toBe(2);
    expect(pointedPlace(rect, 230)).toBe(2);
    expect(pointedPlace(new DOMRect(), 50)).toBe(0);
  });

  it('choisit la place libre la plus proche du doigt', () => {
    expect(nearestFreePlace([_, _, _], rect, 105)).toBe(0);
    expect(nearestFreePlace([_, _, _], rect, 150)).toBe(1);
    expect(nearestFreePlace([_, _, _], rect, 199)).toBe(2);
    expect(nearestFreePlace([_, 0, _], rect, 148)).toBe(0);
    expect(nearestFreePlace([_, 0, _], rect, 152)).toBe(2);
    expect(nearestFreePlace([0, 1, _], rect, 105)).toBe(2);
  });

  it('prend la première place libre sans position connue, et rien dans un pot plein', () => {
    expect(nearestFreePlace([0, _, _], new DOMRect(), 0)).toBe(1);
    expect(nearestFreePlace([0, 1, 2], rect, 150)).toBeNull();
  });
});

describe('partie', () => {
  const start = bouquetsLevel(1);

  // Pots de 100 px de large posés côte à côte : le pot n occupe les x de 100n à 100n + 100.
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const pot = this.getAttribute('data-pot');
      return pot === null ? new DOMRect() : new DOMRect(Number(pot) * 100, 0, 100, 200);
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const xOf = (pot: number, place: number) => pot * 100 + (FRONT_PLACES[place]?.[0] ?? 0.5) * 100;
  /** Touche le pot `pot` à la position `x`, mesurée depuis son bord gauche. */
  const tapPot = (host: HTMLElement, pot: number, x: number) =>
    pots(host)[pot]?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: pot * 100 + x }));
  /** Touche le pot `pot` au-dessus de sa place `place`. */
  const tapAt = (host: HTMLElement, pot: number, place: number) => tapPot(host, pot, xOf(0, place));
  const liftedPlace = (host: HTMLElement) => host.querySelector('.bq-slot.lifted')?.getAttribute('data-place');

  const mount = () => {
    const host = document.createElement('div');
    document.body.append(host);
    const onProgress = vi.fn();
    const onWin = vi.fn();
    const unmount = mountBouquetsPlay(host, { start, strings: fr, onProgress, onWin });
    return { host, onProgress, onWin, unmount };
  };

  it('signale l’état initial dès le montage', () => {
    const { onProgress, unmount } = mount();
    expect(onProgress).toHaveBeenCalledWith({ state: liveState(start), value: 0, replay: '' });
    unmount();
  });

  it('joue au toucher, signale chaque coup et produit un replay gagnant valide', () => {
    const { host, onProgress, onWin, unmount } = mount();
    for (const action of bouquetsWin(1)) {
      if (action.type !== 'move') continue;
      tapAt(host, action.from, action.slot);
      tapAt(host, action.to, action.place);
    }
    expect(onWin).toHaveBeenCalledOnce();
    const replay = onWin.mock.calls[0]?.[0] as string;
    expect(bouquets.replay('c:1', replay)).toMatchObject({ finished: true });
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ replay }));
    unmount();
  });

  it('soulève une fleur, puis la repose en la touchant de nouveau', () => {
    const { host, unmount } = mount();
    tapAt(host, 0, 0);
    expect(liftedPlace(host)).toBe('0');
    tapAt(host, 0, 0);
    expect(liftedPlace(host)).toBeUndefined();
    unmount();
  });

  it('retire un coup à l’annulation et recommence à zéro', () => {
    const { host, onProgress, unmount } = mount();
    const first = bouquetsWin(1)[0];
    if (first?.type !== 'move') throw new Error('premier coup attendu');
    tapAt(host, first.from, first.slot);
    tapAt(host, first.to, first.place);
    const [restart, undo] = [...host.querySelectorAll<HTMLButtonElement>('.controls button')];
    expect(host.querySelector('.counter')?.textContent).toBe('1 coup');
    undo?.click();
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ value: 0, replay: `${encodeActions([first])}u` }),
    );
    expect(host.querySelector('.counter')?.textContent).toBe('0 coups');
    restart?.click();
    expect(onProgress).toHaveBeenLastCalledWith({ state: liveState(start), value: 0, replay: '' });
    unmount();
  });

  const mountBoard = (start: Board) => {
    const host = document.createElement('div');
    const onProgress = vi.fn();
    mountBouquetsPlay(host, { start, strings: fr, onProgress, onWin: vi.fn() });
    return { host, onProgress };
  };

  it('prend la fleur de la place visée, même là où les images voisines se chevauchent', () => {
    const { host } = mountBoard([[[0, 1, 2]], [[_, _, _]]]);
    expect(host.querySelector('.bq-play .bq-pot')).not.toBeNull();
    tapPot(host, 0, 50);
    expect(liftedPlace(host)).toBe('1');
    tapPot(host, 0, 34);
    expect(liftedPlace(host)).toBe('0');
    tapPot(host, 0, 90);
    expect(liftedPlace(host)).toBe('2');
  });

  it('ne prend rien en visant une place libre', () => {
    const { host } = mountBoard([[[0, _, 2]], [[_, _, _]]]);
    tapPot(host, 0, 50);
    expect(liftedPlace(host)).toBeUndefined();
  });

  it('prend la fleur visée d’un pot plein plutôt que d’y poser la fleur soulevée', () => {
    const { host, onProgress } = mountBoard([[[0, 1, _]], [[2, 1, 0]], [[2, 0, 2]], [[1, _, _]]]);
    tapAt(host, 0, 0);
    tapAt(host, 1, 2);
    expect(pots(host)[1]?.querySelector('.bq-slot.lifted')?.getAttribute('data-place')).toBe('2');
    expect(onProgress).toHaveBeenCalledOnce();
  });

  it('secoue le pot de la fleur soulevée quand on vise une de ses places libres', () => {
    const { host, onProgress } = mountBoard([[[0, 1, _]], [[2, 1, 0]], [[2, 0, 2]], [[1, _, _]]]);
    tapAt(host, 0, 0);
    tapAt(host, 0, 2);
    expect(pots(host)[0]?.classList.contains('shake')).toBe(true);
    expect(liftedPlace(host)).toBe('0');
    expect(onProgress).toHaveBeenCalledOnce();
  });

  it('prévient quand plus aucun coup n’est possible', () => {
    const host = document.createElement('div');
    const blocked: Board = [[[0, 1, 2]], [[1, 2, 0]], [[2, 0, 1]]];
    mountBouquetsPlay(host, { start: blocked, strings: fr, onProgress: vi.fn(), onWin: vi.fn() });
    const hint = host.querySelector<HTMLElement>('.bq-hint');
    expect(hint?.hidden).toBe(false);
    expect(hint?.textContent).toBe(fr.stuck);
  });

  it('cache l’avertissement tant qu’un coup reste possible', () => {
    const { host, unmount } = mount();
    expect(host.querySelector<HTMLElement>('.bq-hint')?.hidden).toBe(true);
    unmount();
  });

  it('empêche la page de défiler ou de s’actualiser pendant qu’on glisse une fleur, et seulement alors', () => {
    const { host, unmount } = mount();
    const touchMove = () => {
      const event = new TouchEvent('touchmove', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(touchMove()).toBe(false);
    pots(host)[0]?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: xOf(0, 0), clientY: 10 }));
    expect(touchMove()).toBe(true);
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: xOf(0, 0), clientY: 10 }));
    expect(touchMove()).toBe(false);
    unmount();
    pots(host)[0]?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: xOf(0, 0), clientY: 10 }));
    expect(touchMove()).toBe(false);
  });

  it('ignore le clic qui suit un glisser', () => {
    const { host, onProgress, unmount } = mount();
    const pot = pots(host)[0];
    if (!pot) throw new Error('pot attendu');
    const calls = onProgress.mock.calls.length;
    pot.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: xOf(0, 0), clientY: 10 }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 60, clientY: 60 }));
    expect(document.querySelector('.bq-ghost')).not.toBeNull();
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 60, clientY: 60 }));
    expect(document.querySelector('.bq-ghost')).toBeNull();
    tapAt(host, 0, 0);
    expect(liftedPlace(host)).toBeUndefined();
    expect(onProgress.mock.calls.length).toBe(calls);
    unmount();
  });
});

describe('replay', () => {
  const mount = (replay: string) => {
    const host = document.createElement('div');
    mountBouquetsReplay(host, bouquetsLevel(1), replay, fr);
    return host;
  };

  it('avance action par action', () => {
    const start = bouquetsLevel(1);
    const replay = encodeActions(bouquetsWin(1));
    const host = document.createElement('div');
    mountBouquetsReplay(host, start, replay, fr);
    const total = replay.length / 4;
    expect(host.querySelector('.counter')?.textContent).toBe(`0 coups / ${total}`);
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('.controls button')];
    buttons[3]?.click();
    expect(host.querySelector('.counter')?.textContent).toBe(`1 coup / ${total}`);
  });

  it('ne montre que le chemin final, sans les coups annulés', () => {
    const win = bouquetsWin(1);
    const [first] = win;
    if (!first) throw new Error('premier coup attendu');
    const withUndo = mount(encodeActions([first, { type: 'undo' }, ...win]));
    const clean = mount(encodeActions(win));
    expect(withUndo.querySelector('.counter')?.textContent).toBe(`0 coups / ${win.length}`);
    for (let step = 0; step < win.length; step++) {
      expect(withUndo.querySelector('.bq-board')?.outerHTML).toBe(clean.querySelector('.bq-board')?.outerHTML);
      withUndo.querySelectorAll<HTMLButtonElement>('.controls button')[3]?.click();
      clean.querySelectorAll<HTMLButtonElement>('.controls button')[3]?.click();
    }
    expect(withUndo.querySelector('.counter')?.textContent).toBe(`${fr.moves(win.length)} / ${win.length}`);
  });
});

describe('indicateur en direct', () => {
  it('distingue le début, l’impasse, la fin proche et le reste', () => {
    expect(potsStatus([{ front: [0, 1, _], hidden: 1 }], 0)).toBe('start');
    expect(
      potsStatus(
        [
          { front: [0, 1, 2], hidden: 0 },
          { front: [1, 2, 0], hidden: 1 },
        ],
        4,
      ),
    ).toBe('stuck');
    expect(
      potsStatus(
        [
          { front: [0, 1, 2], hidden: 1 },
          { front: [3, 4, _], hidden: 1 },
        ],
        4,
      ),
    ).toBe('stuck');
    expect(
      potsStatus(
        [
          { front: [0, 0, _], hidden: 0 },
          { front: [0, _, _], hidden: 0 },
        ],
        4,
      ),
    ).toBe('close');
    expect(
      potsStatus(
        [
          { front: [0, 0, _], hidden: 2 },
          { front: [0, _, _], hidden: 0 },
        ],
        4,
      ),
    ).toBe('far');
    expect(potsStatus([{ front: [_, _, _], hidden: 0 }], 9)).toBe('close');
  });

  it('lit un état de jeu valide, et rien d’autre', () => {
    expect(bouquetsClient.liveStatus('ab-1.---0', 0)).toBe('start');
    expect(bouquetsClient.renderLiveState('ab-1.---0')?.querySelectorAll('.bq-pot')).toHaveLength(2);
    expect(bouquetsClient.liveStatus('n’importe quoi', 0)).toBeNull();
    expect(bouquetsClient.renderLiveState('n’importe quoi')).toBeNull();
  });
});
