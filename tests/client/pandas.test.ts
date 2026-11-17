import { describe, expect, it, vi } from 'vitest';
import type { GameView } from '../../src/client/games/client-game.ts';
import { cellSize, MIN_CELL, renderMiniGrid } from '../../src/client/games/pandas/board.ts';
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
  it('suit la campagne commune et marque parfait un niveau gagné sans coup de trop', () => {
    expect(pandasClient.definition.id).toBe('pandas');
    expect(pandasClient.icon).toEqual({ kind: 'emoji', emoji: '🐼' });
    const v = view({
      records: { 'c:1': [{ player: ME, value: 5, run: 'r1' }], 'c:2': [{ player: ME, value: 7, run: 'r2' }] },
    });
    expect(pandasClient.levelProgress(v, ME)).toEqual({ unlocked: 3, total: MAX_LEVEL });
    expect(pandasClient.levelTile(1, v)).toMatchObject({ status: 'done', perfect: true, recordPerfect: true });
    expect(pandasClient.levelTile(2, v)).toMatchObject({ status: 'done', perfect: false });
    expect(pandasClient.keyLabel('c:5', 'zh')).toBe('第 5 关');
    expect(pandasClient.formatValue?.(1, 'fr')).toBe('1 coup');
  });

  it('a les mêmes textes dans chaque langue', () => {
    expect(Object.keys(PANDAS_STRINGS.zh).sort()).toEqual(Object.keys(fr).sort());
  });
});

describe('partie', () => {
  it('signale la grille vide dès le montage', () => {
    const { onProgress } = mount();
    expect(onProgress).toHaveBeenCalledWith({ state: liveState(grid, []), value: 0, replay: '' });
  });

  it('fait passer une case de vide à croix, puis à panda, puis à vide, sans compter la croix', () => {
    const { host, onProgress } = mount();
    cells(host)[3]?.click();
    expect(cells(host)[3]?.textContent).toBe('✕');
    expect(host.querySelector('.counter')?.textContent).toBe('0 coups');
    cells(host)[3]?.click();
    expect(cells(host)[3]?.textContent).toBe('🐼');
    expect(cells(host)[3]?.getAttribute('aria-label')).toBe('Ligne 1, colonne 4, panda');
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ value: 1, replay: '03' }));
    cells(host)[3]?.click();
    expect(cells(host)[3]?.textContent).toBe('');
    expect(host.querySelector('.counter')?.textContent).toBe('2 coups');
  });

  it('cercle de rouge deux pandas qui enfreignent une règle', () => {
    const { host } = mount();
    for (const cell of [0, 0, 4, 4]) cells(host)[cell]?.click();
    expect(cells(host)[0]?.classList.contains('clash')).toBe(true);
    expect(cells(host)[4]?.classList.contains('clash')).toBe(true);
  });

  it('gagne en posant la solution et produit un replay au meilleur score possible', () => {
    const { host, onWin } = mount();
    for (const cell of solution) {
      cells(host)[cell]?.click();
      cells(host)[cell]?.click();
    }
    expect(onWin).toHaveBeenCalledOnce();
    const replay = onWin.mock.calls[0]?.[0] as string;
    expect(pandas.replay('c:1', replay)).toEqual({ finished: true, value: 5 });
    expect(host.querySelector('.board-host')?.classList.contains('solved')).toBe(true);
    // Une fois la grille résolue, un toucher ne change plus rien.
    cells(host)[0]?.click();
    expect(cells(host)[0]?.textContent).toBe('');
  });

  it('annule le dernier coup et recommence à zéro, croix comprises', () => {
    const { host, onProgress } = mount();
    for (const cell of [2, 2]) cells(host)[cell]?.click();
    cells(host)[6]?.click();
    const [restart, undo] = [...host.querySelectorAll<HTMLButtonElement>('.controls button')];
    undo?.click();
    expect(cells(host)[2]?.textContent).toBe('');
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ value: 0, replay: '02u' }));
    expect(undo?.disabled).toBe(true);
    restart?.click();
    expect(cells(host)[6]?.textContent).toBe('');
    expect(onProgress).toHaveBeenLastCalledWith({ state: liveState(grid, []), value: 0, replay: '' });
  });

  it('explique le toucher sous la grille', () => {
    expect(mount().host.querySelector('.pd-hint')?.textContent).toBe(fr.hint);
  });
});

describe('replay', () => {
  it('avance pose par pose, sans les coups annulés', () => {
    const host = document.createElement('div');
    const replay = encodeActions([
      { type: 'toggle', cell: 0 },
      { type: 'undo' },
      ...solution.map((cell) => ({ type: 'toggle' as const, cell })),
    ]);
    mountPandasReplay(host, grid, replay, fr);
    expect(host.querySelector('.counter')?.textContent).toBe('0 coups / 5');
    host.querySelectorAll<HTMLButtonElement>('.controls button')[3]?.click();
    expect(host.querySelector('.counter')?.textContent).toBe('1 coup / 5');
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
