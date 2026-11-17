import { describe, expect, it, vi } from 'vitest';
import type { GameView } from '../../src/client/games/client-game.ts';
import { MIN_TUBE, MINI_WIDTH, renderBoard, renderMiniBoard, tubeWidth } from '../../src/client/games/fioles/board.ts';
import { fiolesClient } from '../../src/client/games/fioles/index.ts';
import { mountFiolesPlay } from '../../src/client/games/fioles/play.ts';
import { mountFiolesReplay } from '../../src/client/games/fioles/replay.ts';
import { boardStatus } from '../../src/client/games/fioles/status.ts';
import { FIOLES_STRINGS } from '../../src/client/games/fioles/strings.ts';
import { createGameView } from '../../src/client/platform/context.ts';
import { MAX_LEVEL } from '../../src/shared/games/campaign.ts';
import { encodeActions, fioles } from '../../src/shared/games/fioles/definition.ts';
import { boardToString, parseBoard } from '../../src/shared/games/fioles/rules.ts';
import type { GameState } from '../../src/shared/platform/protocol.ts';
import { fiolesLevel, solve } from '../support/fioles-solver.ts';

const ME = 'player1';
const OTHER = 'player2';

function view(overrides: Partial<GameState> = {}): GameView {
  const state: GameState = {
    players: [
      { id: ME, name: 'Moi', created: 1, avatar: null },
      { id: OTHER, name: 'Ami', created: 2, avatar: null },
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

  it('situe chaque joueur au premier niveau qu’il n’a pas gagné', () => {
    expect(fiolesClient.levelProgress(v, ME)).toEqual({ unlocked: 3, total: MAX_LEVEL });
    expect(fiolesClient.levelProgress(v, OTHER)).toEqual({ unlocked: 1, total: MAX_LEVEL });
    expect(fiolesClient.levelProgress(view(), ME)).toEqual({ unlocked: 1, total: MAX_LEVEL });
    expect(fiolesClient.levelOf('c:12')).toBe(12);
    expect(fiolesClient.levelOf('x')).toBeNull();
  });

  it('marque réussi un niveau gagné en rejoignant un ami, sans débloquer la suite', () => {
    const joined = view({
      records: { 'c:1': [{ player: ME, value: 9, run: 'r1' }], 'c:5': [{ player: ME, value: 30, run: 'r2' }] },
    });
    expect(fiolesClient.levelProgress(joined, ME).unlocked).toBe(2);
    expect(fiolesClient.levelTile(5, joined).status).toBe('done');
    expect(fiolesClient.levelTile(6, joined).status).toBe('locked');
  });

  it('donne l’état de chaque case : réussie avec score parfait, jouable, verrouillée', () => {
    // 9 coups est le meilleur score possible au niveau 1.
    expect(fiolesClient.levelTile(1, v)).toEqual({
      key: 'c:1',
      label: '1',
      status: 'done',
      perfect: true,
      perfectHolders: [{ player: ME, name: 'Moi' }],
    });
    expect(fiolesClient.levelTile(3, v)).toEqual({
      key: 'c:3',
      label: '3',
      status: 'open',
      perfect: false,
      perfectHolders: [],
    });
    expect(fiolesClient.levelTile(4, v)).toEqual({
      key: 'c:4',
      label: '4',
      status: 'locked',
      perfect: false,
      perfectHolders: [],
    });
    expect(fiolesClient.levelTile(8, v).status).toBe('locked');
  });

  it('donne tous les détenteurs ex æquo du score parfait', () => {
    const tied = view({
      records: {
        'c:1': [
          { player: OTHER, value: 9, run: 'r2' },
          { player: ME, value: 9, run: 'r1' },
        ],
      },
    });
    const tile = fiolesClient.levelTile(1, tied);
    expect(tile.perfect).toBe(true);
    expect(tile.perfectHolders).toEqual([
      { player: OTHER, name: 'Ami' },
      { player: ME, name: 'Moi' },
    ]);
  });

  it('donne les autres détenteurs du score parfait à un joueur qui ne l’a pas', () => {
    const behind = view({
      records: {
        'c:1': [
          { player: OTHER, value: 9, run: 'r2' },
          { player: ME, value: 12, run: 'r1' },
        ],
      },
    });
    const tile = fiolesClient.levelTile(1, behind);
    expect(tile.status).toBe('done');
    expect(tile.perfect).toBe(false);
    expect(tile.perfectHolders).toEqual([{ player: OTHER, name: 'Ami' }]);
  });

  it('ne donne aucun détenteur tant que personne n’a le score parfait', () => {
    const worse = view({ records: { 'c:1': [{ player: OTHER, value: 12, run: 'r9' }] } });
    const tile = fiolesClient.levelTile(1, worse);
    expect(tile.perfect).toBe(false);
    expect(tile.perfectHolders).toEqual([]);
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
  const start = fiolesLevel(1);
  const data = boardToString(start);
  const tubes = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('.tube')];

  it('signale l’état initial dès le montage', () => {
    const host = document.createElement('div');
    const onProgress = vi.fn();
    mountFiolesPlay(host, { start, strings: FIOLES_STRINGS.fr, onProgress, onWin: vi.fn() });
    expect(onProgress).toHaveBeenCalledWith({ state: data, value: 0, replay: '' });
  });

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

  it('retire un coup à l’annulation et recommence à zéro', () => {
    const host = document.createElement('div');
    const onProgress = vi.fn();
    mountFiolesPlay(host, { start, strings: FIOLES_STRINGS.fr, onProgress, onWin: vi.fn() });
    const first = solve(start)?.[0];
    if (first?.type !== 'pour') throw new Error('premier coup attendu');
    tubes(host)[first.from]?.click();
    tubes(host)[first.to]?.click();
    const [restart, undo] = [...host.querySelectorAll('.controls button')] as HTMLButtonElement[];
    expect(host.querySelector('.counter')?.textContent).toBe('1 coup');
    undo?.click();
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ value: 0, replay: `${encodeActions([first])}u` }),
    );
    expect(host.querySelector('.counter')?.textContent).toBe('0 coups');
    restart?.click();
    expect(onProgress).toHaveBeenLastCalledWith({ state: data, value: 0, replay: '' });
  });

  it('place le compteur sur le plateau et les boutons dessous, sans rangée à part', () => {
    const host = document.createElement('div');
    mountFiolesPlay(host, { start, strings: FIOLES_STRINGS.fr, onProgress: vi.fn(), onWin: vi.fn() });
    expect([...host.children].map((child) => child.className)).toEqual(['table', 'controls']);
    expect(host.querySelector('.table > .counter')?.textContent).toBe('0 coups');
    const buttons = [...(host.querySelector('.controls')?.children ?? [])];
    expect(buttons.map((child) => child.textContent)).toEqual(['⟲ Recommencer', '↶ Annuler']);
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

  it('ne compte pas les coups annulés', () => {
    const start = parseBoard('aaab.bbba..') ?? [];
    const win = solve(start) ?? [];
    const [first] = win;
    if (!first) throw new Error('premier coup attendu');
    const host = document.createElement('div');
    mountFiolesReplay(host, start, encodeActions([first, { type: 'undo' }, ...win]), FIOLES_STRINGS.fr);
    expect(host.querySelector('.counter')?.textContent).toBe(`0 coups / ${win.length}`);
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

  it('garde des fioles assez larges pour le doigt, sauf sur un aperçu', () => {
    expect(tubeWidth(7, 140)).toBe(MIN_TUBE);
    expect(tubeWidth(7, 140, 8)).toBe(15);
    expect(tubeWidth(3, 900)).toBe(56);
  });

  it('dessine un aperçu lisible sur deux rangées au-delà de six fioles', () => {
    const board = Array.from({ length: 14 }, () => [0, 1]);
    const mini = renderMiniBoard(board);
    const width = Number.parseInt(mini.querySelector<HTMLElement>('.board')?.style.getPropertyValue('--tw') ?? '', 10);
    const rows = [...mini.querySelectorAll('.board-row')];
    expect(rows).toHaveLength(2);
    expect(rows[0]?.children).toHaveLength(7);
    expect(width).toBeGreaterThanOrEqual(10);
    // Sept fioles et leurs écarts (28 % d'une fiole) dans la largeur d'un aperçu.
    expect(7 * width + 6 * width * 0.28).toBeLessThanOrEqual(MINI_WIDTH);
  });
});

describe('indicateur en direct', () => {
  it('distingue le début, l’impasse, la fin proche et le reste', () => {
    const start = parseBoard('aaab.bbba..');
    expect(start).not.toBeNull();
    expect(boardStatus(start ?? [], 0)).toBe('start');

    const stuck = [
      [0, 1, 0, 1],
      [1, 0, 1, 0],
      [2, 3, 2, 3],
      [3, 2, 3, 2],
    ];
    expect(boardStatus(stuck, 3)).toBe('stuck');
    // Des versements restent possibles, mais aucun ne mène à la victoire.
    expect(boardStatus(parseBoard('cacb.bacc.bab.a') ?? [], 3)).toBe('stuck');

    const close = [[0, 0, 0, 0], [1, 1, 2, 2], [2, 2, 1, 1], []];
    expect(boardStatus(close, 2)).toBe('close');

    const far = [[0, 0, 0, 1], [1, 1, 2, 2], [2, 2, 3, 3], [3, 3, 1, 0], []];
    expect(boardStatus(far, 2)).toBe('far');
  });

  it('lit un état de jeu valide, et rien d’autre', () => {
    expect(fiolesClient.liveStatus('abab.baba..', 0)).toBe('start');
    expect(fiolesClient.liveStatus('n’importe quoi', 0)).toBeNull();
  });
});
