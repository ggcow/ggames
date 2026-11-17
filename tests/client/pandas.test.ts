import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameView } from '../../src/client/games/client-game.ts';
import { cellSize, LONG_PRESS_MS, MIN_CELL, renderMiniGrid } from '../../src/client/games/pandas/board.ts';
import { pandasClient } from '../../src/client/games/pandas/index.ts';
import { mountPandasPlay } from '../../src/client/games/pandas/play.ts';
import { mountPandasReplay } from '../../src/client/games/pandas/replay.ts';
import { pandasStatus } from '../../src/client/games/pandas/status.ts';
import { PANDAS_STRINGS } from '../../src/client/games/pandas/strings.ts';
import { createGameView } from '../../src/client/platform/context.ts';
import { MAX_LEVEL } from '../../src/shared/games/campaign.ts';
import { encodeActions, pandas } from '../../src/shared/games/pandas/definition.ts';
import { liveState } from '../../src/shared/games/pandas/rules.ts';
import type { GameState } from '../../src/shared/platform/protocol.ts';
import { pandasLevel, pandasSolution } from '../support/pandas.ts';

const ME = 'player1';
const fr = PANDAS_STRINGS.fr;
// Niveau 1, 5 × 5 : solution 1, 8, 10, 17, 24.
const grid = pandasLevel(1);
const solution = pandasSolution(grid);

function view(overrides: Partial<GameState> = {}): GameView {
  const state: GameState = {
    players: [{ id: ME, name: 'Moi', created: 1, avatar: null }],
    progress: [],
    records: {},
    ...overrides,
  };
  return createGameView(state, ME, 'fr');
}

const cells = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>('.pd-cell')];
const mount = () => {
  const host = document.createElement('div');
  const onProgress = vi.fn();
  const onWin = vi.fn();
  const unmount = mountPandasPlay(host, { grid, strings: fr, onProgress, onWin });
  return { host, onProgress, onWin, unmount };
};

describe('jeu', () => {
  it('suit la campagne commune, sans score : ni diamant ni record sur les cases', () => {
    expect(pandasClient.definition.id).toBe('pandas');
    expect(pandasClient.icon).toEqual({ kind: 'emoji', emoji: '🐼' });
    const v = view({
      records: { 'c:1': [{ player: ME, value: 5, run: 'r1' }], 'c:2': [{ player: ME, value: 7, run: 'r2' }] },
    });
    expect(pandasClient.levelProgress(v, ME)).toEqual({ unlocked: 3, total: MAX_LEVEL });
    expect(pandasClient.levelTile(1, v)).toEqual({
      key: 'c:1',
      label: '1',
      status: 'done',
      perfect: false,
      holders: [],
      recordPerfect: false,
    });
    expect(pandasClient.levelTile(3, v).status).toBe('open');
    expect(pandasClient.keyLabel('c:5', 'zh')).toBe('第 5 关');
    expect(pandasClient.formatValue).toBeNull();
  });

  it('a les mêmes textes dans chaque langue', () => {
    expect(Object.keys(PANDAS_STRINGS.zh).sort()).toEqual(Object.keys(fr).sort());
  });
});

describe('partie', () => {
  afterEach(() => vi.useRealTimers());

  const rightClick = (element: HTMLElement | undefined) => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    element?.dispatchEvent(event);
    return event;
  };
  const touch = (element: HTMLElement | undefined, type: 'pointerdown' | 'pointerup', pointerType = 'touch') =>
    element?.dispatchEvent(new PointerEvent(type, { pointerType, bubbles: true }));

  it('signale la grille vide dès le montage', () => {
    const { onProgress } = mount();
    expect(onProgress).toHaveBeenCalledWith({ state: liveState(grid, []), value: 0, replay: '' });
  });

  it('pose et retire un panda au clic droit, sans menu du navigateur, compteur de coups ni bouton Annuler', () => {
    const { host, onProgress } = mount();
    const event = rightClick(cells(host)[3]);
    expect(event.defaultPrevented).toBe(true);
    expect(cells(host)[3]?.textContent).toBe('🐼');
    expect(cells(host)[3]?.getAttribute('aria-label')).toBe('Ligne 1, colonne 4, panda');
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ replay: '03' }));
    rightClick(cells(host)[3]);
    expect(cells(host)[3]?.textContent).toBe('');
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ replay: '0303' }));
    expect(host.querySelector('.counter')).toBeNull();
    expect([...host.querySelectorAll('.controls button')].map((button) => button.textContent)).toEqual([fr.restart]);
  });

  it('met et enlève une croix au clic, sans coup joué', () => {
    const { host, onProgress } = mount();
    const calls = onProgress.mock.calls.length;
    cells(host)[6]?.click();
    expect(cells(host)[6]?.textContent).toBe('✕');
    expect(cells(host)[6]?.getAttribute('aria-label')).toBe('Ligne 2, colonne 2, écartée');
    cells(host)[6]?.click();
    expect(cells(host)[6]?.textContent).toBe('');
    expect(onProgress).toHaveBeenCalledTimes(calls);
  });

  it('remplace la croix par un panda au clic droit, et ne met pas de croix sur un panda', () => {
    const { host } = mount();
    cells(host)[6]?.click();
    rightClick(cells(host)[6]);
    expect(cells(host)[6]?.textContent).toBe('🐼');
    cells(host)[6]?.click();
    expect(cells(host)[6]?.textContent).toBe('🐼');
    rightClick(cells(host)[6]);
    expect(cells(host)[6]?.textContent).toBe('');
  });

  it('pose un panda sur un appui long au doigt, sans croix au relâcher', () => {
    vi.useFakeTimers();
    const { host } = mount();
    touch(cells(host)[6], 'pointerdown');
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(cells(host)[6]?.textContent).toBe('🐼');
    // Le navigateur envoie encore un clic et, sur Android, un menu contextuel : ni l'un ni l'autre ne compte.
    cells(host)[6]?.click();
    rightClick(cells(host)[6]);
    expect(cells(host)[6]?.textContent).toBe('🐼');
  });

  it('ne compte pas pour un appui long un toucher bref ni un appui de souris', () => {
    vi.useFakeTimers();
    const { host } = mount();
    touch(cells(host)[6], 'pointerdown');
    touch(cells(host)[6], 'pointerup');
    touch(cells(host)[7], 'pointerdown', 'mouse');
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    expect(host.querySelectorAll('.pd-cell.panda')).toHaveLength(0);
  });

  it('cercle de rouge deux pandas qui enfreignent une règle', () => {
    const { host } = mount();
    rightClick(cells(host)[0]);
    rightClick(cells(host)[4]);
    expect(cells(host)[0]?.classList.contains('clash')).toBe(true);
    expect(cells(host)[4]?.classList.contains('clash')).toBe(true);
  });

  it('gagne en posant la solution et produit un replay valide', () => {
    const { host, onWin } = mount();
    for (const cell of solution) rightClick(cells(host)[cell]);
    expect(onWin).toHaveBeenCalledOnce();
    const replay = onWin.mock.calls[0]?.[0] as string;
    expect(pandas.replay('c:1', replay)).toEqual({ finished: true, value: 5 });
    expect(host.querySelector('.board-host')?.classList.contains('solved')).toBe(true);
    // Une fois la grille résolue, ni clic ni clic droit ne change plus rien.
    cells(host)[0]?.click();
    rightClick(cells(host)[0]);
    expect(cells(host)[0]?.textContent).toBe('');
  });

  it('recommence à zéro, croix comprises', () => {
    const { host, onProgress } = mount();
    rightClick(cells(host)[2]);
    cells(host)[6]?.click();
    host.querySelector<HTMLButtonElement>('.controls button')?.click();
    expect(cells(host)[2]?.textContent).toBe('');
    expect(cells(host)[6]?.textContent).toBe('');
    expect(onProgress).toHaveBeenLastCalledWith({ state: liveState(grid, []), value: 0, replay: '' });
  });

  it('explique les commandes sous la grille', () => {
    expect(mount().host.querySelector('.pd-hint')?.textContent).toBe(fr.hint);
  });
});

describe('replay', () => {
  it('avance case par case, sans compteur de coups', () => {
    const host = document.createElement('div');
    mountPandasReplay(host, grid, encodeActions([0, 0, ...solution]));
    expect(host.querySelector('.counter')).toBeNull();
    host.querySelectorAll<HTMLButtonElement>('.controls button')[3]?.click();
    expect(host.querySelectorAll('.pd-cell.panda')).toHaveLength(1);
    expect(host.querySelector('button.pd-cell')).toBeNull();
  });
});

describe('aperçu et indicateur en direct', () => {
  it('dessine l’aperçu d’un état valide, et rien d’autre', () => {
    const mini = pandasClient.renderLiveState(liveState(grid, [1, 8]));
    expect(mini?.querySelectorAll('.pd-cell')).toHaveLength(25);
    expect(mini?.querySelectorAll('.pd-cell.panda')).toHaveLength(2);
    expect(pandasClient.renderLiveState('n’importe quoi')).toBeNull();
    expect(renderMiniGrid(grid, []).classList.contains('mini')).toBe(true);
  });

  it('distingue le début, l’impasse, la fin proche et le reste', () => {
    expect(pandasStatus(grid, [], 0)).toBe('start');
    expect(pandasStatus(grid, [1], 1)).toBe('far');
    expect(pandasStatus(grid, [0], 1)).toBe('stuck');
    expect(pandasStatus(grid, [1, 8, 10], 3)).toBe('close');
    expect(pandasStatus(grid, solution, 5)).toBe('close');
    expect(pandasClient.liveStatus(liveState(grid, [0]), 1)).toBe('stuck');
    expect(pandasClient.liveStatus('n’importe quoi', 0)).toBeNull();
  });

  it('garde des cases assez grandes pour le doigt, sauf sur un aperçu', () => {
    expect(cellSize(10, 200)).toBe(MIN_CELL);
    expect(cellSize(10, 140, 8)).toBe(14);
    expect(cellSize(5, 900)).toBe(56);
  });
});
