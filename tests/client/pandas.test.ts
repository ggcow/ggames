import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameView } from '../../src/client/games/client-game.ts';
import {
  cellSize,
  HIDDEN_REGION,
  MIN_CELL,
  MULTI_TAP_MS,
  REGION_COLORS,
  renderMiniGrid,
} from '../../src/client/games/pandas/board.ts';
import { pandasClient } from '../../src/client/games/pandas/index.ts';
import { mountPandasPlay } from '../../src/client/games/pandas/play.ts';
import { mountPandasReplay } from '../../src/client/games/pandas/replay.ts';
import { pandasStatus } from '../../src/client/games/pandas/status.ts';
import { PANDAS_STRINGS } from '../../src/client/games/pandas/strings.ts';
import { createGameView } from '../../src/client/platform/context.ts';
import { renderLevelGrid } from '../../src/client/platform/level-grid.ts';
import { PLATFORM_STRINGS } from '../../src/client/platform/strings.ts';
import { encodeActions, pandas } from '../../src/shared/games/pandas/definition.ts';
import { LEVEL_COUNT, liveState } from '../../src/shared/games/pandas/rules.ts';
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
    lockedUntil: {},
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
    // Niveaux 1 et 2 gagnés : les trois premiers à gagner sont 3, 4 et 5.
    expect(pandasClient.levelProgress(v, ME)).toEqual({ current: 3, unlocked: 5, total: LEVEL_COUNT });
    expect(pandasClient.levelTile(1, v)).toEqual({
      key: 'c:1',
      label: '1',
      status: 'done',
      perfect: false,
      holders: [],
      recordPerfect: false,
    });
    expect(pandasClient.levelTile(3, v).status).toBe('open');
    expect(pandasClient.levelTile(5, v).status).toBe('open');
    expect(pandasClient.levelTile(6, v).status).toBe('locked');
    expect(pandasClient.keyLabel('c:5', 'zh')).toBe('第 5 关');
    expect(pandasClient.formatValue).toBeNull();
  });

  it('garde trois niveaux à gagner ouverts dans la grille, au-delà des niveaux déjà gagnés, sauf blocage', () => {
    const now = 1_000_000;
    const records = Object.fromEntries(
      [1, 2, 4, 9].map((level) => [`c:${level}`, [{ player: ME, value: 0, run: `r${level}` }]]),
    );
    const grid = (lockedUntil: Record<string, number>) => {
      const v = view({ records, lockedUntil });
      const levels = [
        ...renderLevelGrid({
          progress: pandasClient.levelProgress(v, ME),
          page: 0,
          tile: (level) => pandasClient.levelTile(level, v),
          positions: [],
          raceSize: pandasClient.raceSize,
          lockedUntil,
          now,
          t: PLATFORM_STRINGS.fr,
          onPage: vi.fn(),
          onPlay: vi.fn(),
        }).querySelectorAll<HTMLButtonElement>('.level'),
      ];
      const levelsIn = (state: string) =>
        levels.flatMap((cell, index) => (cell.classList.contains(state) ? [index + 1] : []));
      return { done: levelsIn('done'), open: levelsIn('open'), cooling: levelsIn('cooling') };
    };
    expect(pandasClient.levelProgress(view({ records }), ME)).toEqual({ current: 3, unlocked: 9, total: LEVEL_COUNT });
    expect(grid({})).toEqual({ done: [1, 2, 4, 9], open: [3, 5, 6], cooling: [] });
    // Le niveau 5 perdu il y a peu : il reste parmi les trois, bloqué, sans ouvrir le 7.
    expect(grid({ 'c:5': now + 60_000 })).toEqual({ done: [1, 2, 4, 9], open: [3, 6], cooling: [5] });
  });

  it('a les mêmes textes dans chaque langue', () => {
    expect(Object.keys(PANDAS_STRINGS.zh).sort()).toEqual(Object.keys(fr).sort());
  });
});

const tripleTap = (host: HTMLElement, cell: number) => {
  for (let tap = 0; tap < 3; tap++) cells(host)[cell]?.click();
};

describe('partie', () => {
  afterEach(() => vi.restoreAllMocks());
  /** Avance l'horloge au-delà de l'écart permis entre deux touchers enchaînés. */
  const pause = () => {
    const later = Date.now() + MULTI_TAP_MS + 1;
    vi.spyOn(Date, 'now').mockReturnValue(later);
  };

  it('signale la grille vide dès le montage, sans vies ni bouton Annuler', () => {
    const { host, onProgress } = mount();
    expect(onProgress).toHaveBeenCalledWith({ state: liveState(grid, [], 0), value: 0, replay: '' });
    expect(host.querySelector('.counter')).toBeNull();
    expect([...host.querySelectorAll('.controls button')].map((button) => button.textContent)).toEqual([fr.restart]);
  });

  it('met et enlève une croix d’un toucher, sans tentative', () => {
    const { host, onProgress } = mount();
    const calls = onProgress.mock.calls.length;
    cells(host)[6]?.click();
    expect(cells(host)[6]?.textContent).toBe('✕');
    expect(cells(host)[6]?.getAttribute('aria-label')).toBe('Ligne 2, colonne 2, écartée');
    pause();
    cells(host)[6]?.click();
    expect(cells(host)[6]?.textContent).toBe('');
    expect(onProgress).toHaveBeenCalledTimes(calls);
  });

  it('ne tente rien d’un double toucher, d’un clic droit ni de touchers trop espacés', () => {
    const { host, onProgress } = mount();
    const calls = onProgress.mock.calls.length;
    cells(host)[8]?.click();
    cells(host)[8]?.click();
    expect(cells(host)[8]?.textContent).toBe('');
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    cells(host)[8]?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    pause();
    cells(host)[8]?.click();
    expect(cells(host)[8]?.textContent).toBe('✕');
    expect(onProgress).toHaveBeenCalledTimes(calls);
  });

  it('pose un panda bien placé d’un triple toucher', () => {
    const { host, onProgress } = mount();
    tripleTap(host, 8);
    expect(cells(host)[8]?.textContent).toBe('🐼');
    expect(cells(host)[8]?.getAttribute('aria-label')).toBe('Ligne 2, colonne 4, panda');
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ replay: '08' }));
    // Un panda bien placé reste : ni croix ni retrait.
    pause();
    tripleTap(host, 8);
    expect(cells(host)[8]?.textContent).toBe('🐼');
  });

  it('perd la partie à la première erreur, marquée d’une croix rouge qui tremble', () => {
    const { host, onLose, onWin } = mount();
    tripleTap(host, 8);
    pause();
    tripleTap(host, 0);
    expect(cells(host)[0]?.classList.contains('miss')).toBe(true);
    expect(cells(host)[0]?.classList.contains('shake')).toBe(true);
    expect(cells(host)[0]?.getAttribute('aria-label')).toBe('Ligne 1, colonne 1, erreur');
    expect(onLose).toHaveBeenCalledExactlyOnceWith('0800');
    expect(onWin).not.toHaveBeenCalled();
    expect(pandas.replay('c:1', '0800')).toEqual({ finished: false, value: 1 });
    expect(host.querySelector<HTMLButtonElement>('.controls button')?.disabled).toBe(true);
    // Plus rien ne se joue ensuite.
    tripleTap(host, 1);
    cells(host)[2]?.click();
    expect(cells(host)[1]?.textContent).toBe('');
    expect(cells(host)[2]?.textContent).toBe('');
  });

  it('gagne en posant la solution et produit un replay valide', () => {
    const { host, onWin } = mount();
    for (const cell of solution) tripleTap(host, cell);
    expect(onWin).toHaveBeenCalledOnce();
    const replay = onWin.mock.calls[0]?.[0] as string;
    expect(pandas.replay('c:1', replay)).toEqual({ finished: true, value: 0 });
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
    pause();
    cells(host)[6]?.click();
    expect(marked()).toEqual([5, 7, 11, 12]);
  });

  it('recommence à zéro, croix et pandas compris', () => {
    const { host, onProgress } = mount();
    tripleTap(host, 8);
    pause();
    cells(host)[6]?.click();
    host.querySelector<HTMLButtonElement>('.controls button')?.click();
    expect(host.querySelectorAll('.pd-cell.panda, .pd-cell.miss')).toHaveLength(0);
    expect(cells(host)[6]?.textContent).toBe('');
    expect(onProgress).toHaveBeenLastCalledWith({ state: liveState(grid, [], 0), value: 0, replay: '' });
  });

  it('explique les commandes sous la grille, et le blocage de trente minutes', () => {
    expect(mount().host.querySelector('.pd-hint')?.textContent).toBe(fr.hint(30));
  });
});

describe('replay', () => {
  it('rejoue tentative par tentative, sans compteur de coups', () => {
    const host = document.createElement('div');
    mountPandasReplay(host, grid, encodeActions(solution));
    expect(host.querySelector('.counter')).toBeNull();
    expect(host.querySelectorAll('.pd-cell.panda')).toHaveLength(0);
    host.querySelectorAll<HTMLButtonElement>('.controls button')[3]?.click();
    expect(host.querySelectorAll('.pd-cell.panda')).toHaveLength(1);
    expect(host.querySelector('button.pd-cell')).toBeNull();
  });
});

describe('aperçu et indicateur en direct', () => {
  it('montre sur l’aperçu les bosquets trouvés, sans la case d’aucun panda, ni vies à côté du nom', () => {
    const mini = pandasClient.renderLiveState(liveState(grid, [1, 8], 0));
    const shown = [...(mini?.querySelectorAll<HTMLElement>('.pd-cell') ?? [])];
    expect(shown).toHaveLength(25);
    expect(mini?.querySelectorAll('.pd-cell.panda')).toHaveLength(0);
    expect(mini?.textContent).not.toContain('🐼');
    const found = new Set([grid.regions[1], grid.regions[8]]);
    shown.forEach((cell, index) => {
      const region = grid.regions[index] ?? 0;
      expect(cell.style.background).toBe(found.has(region) ? REGION_COLORS[region] : HIDDEN_REGION);
    });
    expect(mini?.textContent).toBe('');
    expect(pandasClient.liveTag(liveState(grid, [1, 8], 0), 2, 'fr')).toBeNull();
    expect(pandasClient.liveTag(liveState(grid, [], 1), 1, 'zh')).toBeNull();
    expect(pandasClient.renderLiveState('n’importe quoi')).toBeNull();
    expect(renderMiniGrid({ grid, found: new Set(), misses: 0 }).classList.contains('mini')).toBe(true);
  });

  it('diffuse à chaque tentative les bosquets trouvés et l’erreur', () => {
    const { host, onProgress } = mount();
    const found = solution[0] ?? 0;
    tripleTap(host, found);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + MULTI_TAP_MS + 1);
    tripleTap(host, 0);
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: liveState(grid, [found], 1), value: 2 }),
    );
    vi.restoreAllMocks();
  });

  it('distingue le début, la fin proche, le reste, et l’impasse après l’erreur', () => {
    const live = (found: number[], misses = 0) => ({ grid, found: new Set(found), misses });
    expect(pandasStatus(live([]), 0)).toBe('start');
    expect(pandasStatus(live([0]), 1)).toBe('far');
    expect(pandasStatus(live([0, 1, 2]), 3)).toBe('close');
    expect(pandasStatus(live([0, 1, 2, 3, 4]), 5)).toBe('close');
    expect(pandasStatus(live([0], 1), 2)).toBe('stuck');
    expect(pandasClient.liveStatus(liveState(grid, [1], 0), 1)).toBe('far');
    expect(pandasClient.liveStatus(liveState(grid, [1], 1), 2)).toBe('stuck');
    expect(pandasClient.liveStatus('n’importe quoi', 0)).toBeNull();
  });

  it('garde des cases assez grandes pour le doigt, sauf sur un aperçu', () => {
    expect(cellSize(10, 200)).toBe(MIN_CELL);
    expect(cellSize(10, 140, 8)).toBe(14);
    expect(cellSize(5, 900)).toBe(56);
  });
});
