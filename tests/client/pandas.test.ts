import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameView } from '../../src/client/games/client-game.ts';
import {
  cellSize,
  DOUBLE_TAP_MS,
  HIDDEN_REGION,
  MIN_CELL,
  REGION_COLORS,
  renderMiniGrid,
} from '../../src/client/games/pandas/board.ts';
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
// Niveau 1, 5 × 5 : solution 1, 8, 10, 17, 24 ; les cases 0, 2 et 3 sont fausses.
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
  const onLose = vi.fn();
  const unmount = mountPandasPlay(host, { grid, strings: fr, onProgress, onWin, onLose });
  return { host, onProgress, onWin, onLose, unmount };
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
  afterEach(() => vi.restoreAllMocks());

  const rightClick = (element: HTMLElement | undefined) => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    element?.dispatchEvent(event);
    return event;
  };
  const doubleTap = (host: HTMLElement, cell: number) => {
    cells(host)[cell]?.click();
    cells(host)[cell]?.click();
  };
  const lives = (host: HTMLElement) => host.querySelector('.pd-lives');

  it('signale la grille vide dès le montage, avec trois vies et sans bouton Annuler', () => {
    const { host, onProgress } = mount();
    expect(onProgress).toHaveBeenCalledWith({ state: liveState(grid, [], 0), value: 0, replay: '' });
    expect(lives(host)?.textContent).toBe('❤️❤️❤️');
    expect(lives(host)?.getAttribute('aria-label')).toBe('3 vies restantes');
    expect([...host.querySelectorAll('.controls button')].map((button) => button.textContent)).toEqual([fr.restart]);
  });

  it('met et enlève une croix d’un toucher, sans tentative', () => {
    const { host, onProgress } = mount();
    const calls = onProgress.mock.calls.length;
    cells(host)[6]?.click();
    expect(cells(host)[6]?.textContent).toBe('✕');
    expect(cells(host)[6]?.getAttribute('aria-label')).toBe('Ligne 2, colonne 2, écartée');
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + DOUBLE_TAP_MS + 1);
    cells(host)[6]?.click();
    expect(cells(host)[6]?.textContent).toBe('');
    expect(onProgress).toHaveBeenCalledTimes(calls);
  });

  it('pose un panda bien placé d’un double toucher', () => {
    const { host, onProgress } = mount();
    doubleTap(host, 8);
    expect(cells(host)[8]?.textContent).toBe('🐼');
    expect(cells(host)[8]?.getAttribute('aria-label')).toBe('Ligne 2, colonne 4, panda');
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ replay: '08' }));
    expect(lives(host)?.textContent).toBe('❤️❤️❤️');
    // Un panda bien placé reste : ni croix ni retrait.
    cells(host)[8]?.click();
    rightClick(cells(host)[8]);
    expect(cells(host)[8]?.textContent).toBe('🐼');
  });

  it('retire une vie pour une tentative ratée, marquée d’une croix rouge qui tremble', () => {
    const { host } = mount();
    const event = rightClick(cells(host)[0]);
    expect(event.defaultPrevented).toBe(true);
    expect(cells(host)[0]?.classList.contains('miss')).toBe(true);
    expect(cells(host)[0]?.classList.contains('shake')).toBe(true);
    expect(cells(host)[0]?.getAttribute('aria-label')).toBe('Ligne 1, colonne 1, erreur');
    expect(lives(host)?.textContent).toBe('❤️❤️🖤');
    // La croix rouge est définitive.
    cells(host)[0]?.click();
    expect(cells(host)[0]?.classList.contains('miss')).toBe(true);
  });

  it('perd la partie à la troisième erreur', () => {
    const { host, onLose, onWin } = mount();
    for (const cell of [0, 2, 3]) rightClick(cells(host)[cell]);
    expect(onLose).toHaveBeenCalledExactlyOnceWith('000203');
    expect(onWin).not.toHaveBeenCalled();
    expect(lives(host)?.textContent).toBe('🖤🖤🖤');
    expect(pandas.replay('c:1', '000203')).toEqual({ finished: false, value: 3 });
    rightClick(cells(host)[8]);
    expect(cells(host)[8]?.textContent).toBe('');
  });

  it('gagne en posant la solution et produit un replay valide', () => {
    const { host, onWin } = mount();
    rightClick(cells(host)[0]);
    for (const cell of solution) doubleTap(host, cell);
    expect(onWin).toHaveBeenCalledOnce();
    const replay = onWin.mock.calls[0]?.[0] as string;
    expect(pandas.replay('c:1', replay)).toEqual({ finished: true, value: 1 });
    expect(host.querySelector('.board-host')?.classList.contains('solved')).toBe(true);
  });

  it('pose des croix en glissant le doigt, sans en enlever aucune, même en partant d’une croix', () => {
    const { host } = mount();
    const table = host.querySelector<HTMLElement>('.board-host');
    const slide = (path: number[]) => {
      const pointAt = vi.spyOn(document, 'elementFromPoint');
      cells(host)[path[0] ?? 0]?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
      for (const cell of path.slice(1)) {
        pointAt.mockReturnValue(cells(host)[cell] ?? null);
        table?.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
      }
      window.dispatchEvent(new PointerEvent('pointerup'));
      // Le navigateur termine le geste par un clic : il ne compte pas.
      cells(host)[path[path.length - 1] ?? 0]?.click();
    };
    const marked = () => cells(host).flatMap((cell, index) => (cell.textContent === '✕' ? [index] : []));
    slide([5, 6, 7]);
    expect(marked()).toEqual([5, 6, 7]);
    slide([6, 11, 12]);
    expect(marked()).toEqual([5, 6, 7, 11, 12]);
    // Un toucher levé sur sa première case enlève toujours la croix.
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + DOUBLE_TAP_MS + 1);
    cells(host)[6]?.click();
    expect(marked()).toEqual([5, 7, 11, 12]);
  });

  it('recommence à zéro, croix, pandas et vies compris', () => {
    const { host, onProgress } = mount();
    doubleTap(host, 8);
    rightClick(cells(host)[0]);
    cells(host)[6]?.click();
    host.querySelector<HTMLButtonElement>('.controls button')?.click();
    expect(host.querySelectorAll('.pd-cell.panda, .pd-cell.miss')).toHaveLength(0);
    expect(cells(host)[6]?.textContent).toBe('');
    expect(lives(host)?.textContent).toBe('❤️❤️❤️');
    expect(onProgress).toHaveBeenLastCalledWith({ state: liveState(grid, [], 0), value: 0, replay: '' });
  });

  it('explique les commandes sous la grille', () => {
    expect(mount().host.querySelector('.pd-hint')?.textContent).toBe(fr.hint);
  });
});

describe('replay', () => {
  it('rejoue tentative par tentative, erreurs comprises, sans compteur de coups', () => {
    const host = document.createElement('div');
    mountPandasReplay(host, grid, encodeActions([0, ...solution]));
    expect(host.querySelector('.counter')).toBeNull();
    host.querySelectorAll<HTMLButtonElement>('.controls button')[3]?.click();
    expect(host.querySelectorAll('.pd-cell.miss')).toHaveLength(1);
    host.querySelectorAll<HTMLButtonElement>('.controls button')[3]?.click();
    expect(host.querySelectorAll('.pd-cell.panda')).toHaveLength(1);
    expect(host.querySelector('button.pd-cell')).toBeNull();
  });
});

describe('aperçu et indicateur en direct', () => {
  it('montre sur l’aperçu les bosquets trouvés et les vies, sans la case d’aucun panda', () => {
    const mini = pandasClient.renderLiveState(liveState(grid, [1, 8], 1));
    const shown = [...(mini?.querySelectorAll<HTMLElement>('.pd-cell') ?? [])];
    expect(shown).toHaveLength(25);
    expect(mini?.querySelectorAll('.pd-cell.panda')).toHaveLength(0);
    expect(mini?.textContent).not.toContain('🐼');
    const found = new Set([grid.regions[1], grid.regions[8]]);
    shown.forEach((cell, index) => {
      const region = grid.regions[index] ?? 0;
      expect(cell.style.background).toBe(found.has(region) ? REGION_COLORS[region] : HIDDEN_REGION);
    });
    expect(mini?.querySelector('.pd-mini-lives')?.textContent).toBe('❤️❤️🖤');
    expect(pandasClient.renderLiveState('n’importe quoi')).toBeNull();
    expect(renderMiniGrid({ grid, found: new Set(), misses: 0 }).classList.contains('mini')).toBe(true);
  });

  it('diffuse à chaque tentative les bosquets trouvés et les erreurs', () => {
    const { host, onProgress } = mount();
    const found = solution[0] ?? 0;
    cells(host)[found]?.click();
    cells(host)[found]?.click();
    cells(host)[0]?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: liveState(grid, [found], 1), value: 2 }),
    );
  });

  it('distingue le début, la fin proche et le reste, sans impasse possible', () => {
    expect(pandasStatus(grid, 0, 0)).toBe('start');
    expect(pandasStatus(grid, 1, 1)).toBe('far');
    expect(pandasStatus(grid, 3, 3)).toBe('close');
    expect(pandasStatus(grid, solution.length, 5)).toBe('close');
    expect(pandasClient.liveStatus(liveState(grid, [1], 1), 2)).toBe('far');
    expect(pandasClient.liveStatus('n’importe quoi', 0)).toBeNull();
  });

  it('garde des cases assez grandes pour le doigt, sauf sur un aperçu', () => {
    expect(cellSize(10, 200)).toBe(MIN_CELL);
    expect(cellSize(10, 140, 8)).toBe(14);
    expect(cellSize(5, 900)).toBe(56);
  });
});
