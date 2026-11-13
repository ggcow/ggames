import { describe, expect, it, vi } from 'vitest';
import { highestLevel } from '../../src/client/games/campaign.ts';
import type { GameView } from '../../src/client/games/client-game.ts';
import { renderBoard } from '../../src/client/games/fioles/board.ts';
import { fiolesClient } from '../../src/client/games/fioles/index.ts';
import { mountFiolesPlay } from '../../src/client/games/fioles/play.ts';
import { mountFiolesReplay } from '../../src/client/games/fioles/replay.ts';
import { FIOLES_STRINGS } from '../../src/client/games/fioles/strings.ts';
import { createGameView } from '../../src/client/platform/context.ts';
import { MAX_LEVEL } from '../../src/shared/games/campaign.ts';
import { campaignBoard, encodeActions, fioles } from '../../src/shared/games/fioles/definition.ts';
import { boardToString, parseBoard } from '../../src/shared/games/fioles/rules.ts';
import type { GameState } from '../../src/shared/platform/protocol.ts';
import { solve } from '../support/fioles-solver.ts';

const ME = 'player1';
const OTHER = 'player2';

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

describe('niveaux', () => {
  const v = view({
    records: {
      'c:1': [{ player: ME, value: 9, run: 'r1' }],
      'c:2': [{ player: ME, value: 14, run: 'r2' }],
      'c:7': [{ player: OTHER, value: 30, run: 'r3' }],
    },
  });

  it('débloque le niveau qui suit le plus haut niveau gagné', () => {
    expect(highestLevel(v, ME)).toBe(2);
    expect(highestLevel(v, OTHER)).toBe(7);
    expect(fiolesClient.levelProgress(v, ME)).toEqual({ unlocked: 3, total: MAX_LEVEL });
    expect(fiolesClient.levelProgress(v, OTHER)).toEqual({ unlocked: 8, total: MAX_LEVEL });
    expect(fiolesClient.levelProgress(view(), ME)).toEqual({ unlocked: 1, total: MAX_LEVEL });
    expect(fiolesClient.levelOf('c:12')).toBe(12);
    expect(fiolesClient.levelOf('x')).toBeNull();
  });

  it('donne l’état de chaque case : réussie avec record, jouable, verrouillée', () => {
    expect(fiolesClient.levelTile(1, v)).toEqual({ key: 'c:1', label: '1', status: 'done', best: '9 coups' });
    expect(fiolesClient.levelTile(3, v)).toEqual({ key: 'c:3', label: '3', status: 'open', best: null });
    expect(fiolesClient.levelTile(4, v)).toEqual({ key: 'c:4', label: '4', status: 'locked', best: null });
    expect(fiolesClient.levelTile(8, v).status).toBe('locked');
  });

  it('nomme les clés et propose le niveau suivant', () => {
    const v = view();
    expect(fiolesClient.keyLabel('c:5', 'fr')).toBe('Niveau 5');
    expect(fiolesClient.keyLabel('c:5', 'zh')).toBe('第 5 关');
    expect(fiolesClient.keyLabel('x:1', 'fr')).toBe('x:1');
    expect(fiolesClient.nextKey('c:5', v)).toBe('c:6');
    expect(fiolesClient.nextKey('x:1', v)).toBeNull();
    expect(fiolesClient.formatValue?.(1, 'fr')).toBe('1 coup');
    expect(fiolesClient.formatValue?.(3, 'zh')).toBe('3 步');
  });

  it('affiche un aperçu en direct uniquement pour un état valide', () => {
    expect(fiolesClient.renderLiveState('abab.baba..')?.querySelectorAll('.tube')).toHaveLength(4);
    expect(fiolesClient.renderLiveState('n’importe quoi')).toBeNull();
  });

  it('a les mêmes textes dans chaque langue', () => {
    expect(Object.keys(FIOLES_STRINGS.zh).sort()).toEqual(Object.keys(FIOLES_STRINGS.fr).sort());
  });
});

describe('partie', () => {
  const start = campaignBoard(1);
  const data = boardToString(start);
  const tubes = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('.tube')];

  it('joue au toucher, signale chaque coup et produit un replay gagnant valide', () => {
    const host = document.createElement('div');
    const onProgress = vi.fn();
    const onWin = vi.fn();
    const unmount = mountFiolesPlay(host, { start, strings: FIOLES_STRINGS.fr, onProgress, onWin });
    for (const action of solve(start) ?? []) {
      if (action.type !== 'pour') continue;
      tubes(host)[action.from]?.click();
      tubes(host)[action.to]?.click();
    }
    expect(onWin).toHaveBeenCalledOnce();
    const replay = onWin.mock.calls[0]?.[0] as string;
    expect(fioles.replay('c:1', replay)).toMatchObject({ finished: true });
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ replay }));
    unmount();
  });

  it('compte l’annulation comme un coup et recommence à zéro', () => {
    const host = document.createElement('div');
    const onProgress = vi.fn();
    mountFiolesPlay(host, { start, strings: FIOLES_STRINGS.fr, onProgress, onWin: vi.fn() });
    const first = solve(start)?.[0];
    if (first?.type !== 'pour') throw new Error('premier coup attendu');
    tubes(host)[first.from]?.click();
    tubes(host)[first.to]?.click();
    const [undo, restart] = [...host.querySelectorAll('.controls button')] as HTMLButtonElement[];
    undo?.click();
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ value: 2, replay: `${encodeActions([first])}u` }),
    );
    expect(host.querySelector('.counter')?.textContent).toBe('2 coups');
    restart?.click();
    expect(onProgress).toHaveBeenLastCalledWith({ state: data, value: 0, replay: '' });
  });

  it('sélectionne puis désélectionne une fiole', () => {
    const host = document.createElement('div');
    mountFiolesPlay(host, { start, strings: FIOLES_STRINGS.fr, onProgress: vi.fn(), onWin: vi.fn() });
    tubes(host)[0]?.click();
    expect(tubes(host)[0]?.classList.contains('selected')).toBe(true);
    tubes(host)[0]?.click();
    expect(tubes(host)[0]?.classList.contains('selected')).toBe(false);
  });
});

describe('replay', () => {
  it('avance action par action', () => {
    const start = parseBoard('aaab.bbba..') ?? [];
    const replay = encodeActions(solve(start) ?? []);
    const host = document.createElement('div');
    mountFiolesReplay(host, start, replay, FIOLES_STRINGS.fr);
    const total = replay.length / 2;
    expect(host.querySelector('.counter')?.textContent).toBe(`0 coups / ${total}`);
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('.controls button')];
    buttons[3]?.click();
    expect(host.querySelector('.counter')?.textContent).toBe(`1 coup / ${total}`);
  });
});

describe('plateau', () => {
  it('n’anime le bouchon que sur la fiole qui vient d’être terminée', () => {
    const host = document.createElement('div');
    const board = [[0, 0, 0, 0], [1, 1, 1, 1], [2, 2, 2], [2]];
    renderBoard(host, board, { width: 390, arrived: { tube: 1, count: 2 } });
    const tubes = [...host.querySelectorAll('.tube')];
    expect(tubes.map((t) => t.classList.contains('done'))).toEqual([true, true, false, false]);
    expect(tubes.map((t) => t.classList.contains('sealed'))).toEqual([false, true, false, false]);
    renderBoard(host, board, { width: 390 });
    expect(host.querySelectorAll('.sealed')).toHaveLength(0);
  });
});
