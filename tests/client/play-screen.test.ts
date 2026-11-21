import { afterEach, describe, expect, it, vi } from 'vitest';
import { pandasClient } from '../../src/client/games/pandas/index.ts';
import { ApiClient } from '../../src/client/platform/api.ts';
import { ChatStore } from '../../src/client/platform/chat.ts';
import type { AppContext } from '../../src/client/platform/context.ts';
import { Installer } from '../../src/client/platform/install.ts';
import { LiveClient } from '../../src/client/platform/live.ts';
import { mountPlay } from '../../src/client/platform/screens/play.ts';
import { createLocalStore } from '../../src/client/platform/storage.ts';
import { PLATFORM_STRINGS } from '../../src/client/platform/strings.ts';
import { closeModals } from '../../src/client/platform/ui.ts';
import type { Account, GameState, Presence, SubmitRunResponse } from '../../src/shared/platform/protocol.ts';
import { pandasLevel, pandasSolution } from '../support/pandas.ts';

const me: Account = { id: 'abc123', name: 'Léa', created: 1, login: 'lea', avatar: '🐶' };
const state: GameState = { players: [me], progress: [], records: {}, lockedUntil: {} };
const won: SubmitRunResponse = {
  run: { id: 'r1', game: 'pandas', key: 'c:1', player: me.id, status: 'won', value: 5, durationMs: 1, ended: 1 },
  records: [{ player: me.id, value: 5, run: 'r1' }],
};

/** Présence figée : les joueurs en direct que voit l'écran, sans connexion. */
class StaticLive extends LiveClient {
  readonly racers: readonly Presence[];

  constructor(online: readonly Presence[]) {
    super(() => {
      throw new Error('pas de connexion dans ce test');
    }, 'ws://test');
    this.racers = online;
  }

  override get presence(): readonly Presence[] {
    return this.racers;
  }
}

/** Contexte réel, sans réseau : l'API simulée sert la partie et accepte la victoire. */
function context(navigate: (route: unknown) => void, online: readonly Presence[] = [], game = state): AppContext {
  const api = new ApiClient(
    vi.fn(async (input: string) => {
      if (input === '/api/games/pandas') return new Response(JSON.stringify(game));
      if (input === '/api/games/pandas/runs') return new Response(JSON.stringify(won));
      return new Response(JSON.stringify([]));
    }),
  );
  return {
    api,
    live: new StaticLive(online),
    chat: new ChatStore(api, createLocalStore(null), me.id),
    installer: new Installer({ userAgent: '', standalone: true }),
    lang: 'fr',
    t: PLATFORM_STRINGS.fr,
    me,
    navigate,
    setLang: vi.fn(),
    setMe: vi.fn(),
    logout: vi.fn(async () => undefined),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Tente un panda sur chaque case : trois touchers enchaînés, puis une pause avant la case suivante. */
function attemptAll(host: HTMLElement, cells: readonly number[]): void {
  const now = Date.now();
  const clock = vi.spyOn(Date, 'now');
  cells.forEach((cell, index) => {
    clock.mockReturnValue(now + index * 1000);
    for (let tap = 0; tap < 3; tap++) host.querySelectorAll<HTMLButtonElement>('.pd-cell')[cell]?.click();
  });
  clock.mockRestore();
}

describe('fin de partie', () => {
  afterEach(closeModals);

  it('propose de rejouer le niveau gagné, qui repart d’une grille vide', async () => {
    const navigate = vi.fn();
    const host = document.createElement('div');
    mountPlay(host, context(navigate), pandasClient, 'c:1');
    await settle();
    attemptAll(host, pandasSolution(pandasLevel(1)));
    await settle();
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('.modal-buttons button')];
    expect(buttons.map((button) => button.textContent)).toEqual(['Suivant', '⟲ Rejouer', '← Retour']);
    buttons[1]?.click();
    expect(document.querySelector('.modal')).toBeNull();
    expect(host.querySelectorAll('.pd-cell.panda')).toHaveLength(0);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('bloque le niveau après une erreur : pas de Rejouer, mais le niveau suivant, encore ouvert', async () => {
    const navigate = vi.fn();
    const host = document.createElement('div');
    mountPlay(host, context(navigate), pandasClient, 'c:1');
    await settle();
    // Case 0 : hors de la solution du niveau 1.
    attemptAll(host, [0]);
    await settle();
    expect(document.querySelector('.modal h2')?.textContent).toBe(PLATFORM_STRINGS.fr.lost);
    expect(document.querySelector('.modal-box')?.textContent).toContain(PLATFORM_STRINGS.fr.cooldownHint(5));
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('.modal-buttons button')];
    expect(buttons.map((button) => button.textContent)).toEqual(['Suivant', '← Retour']);
    buttons[0]?.click();
    expect(navigate).toHaveBeenCalledWith({ name: 'play', game: 'pandas', key: 'c:2' });
  });

  it('ne propose pas un niveau suivant lui-même bloqué', async () => {
    const host = document.createElement('div');
    const blocked = { ...state, lockedUntil: { 'c:2': Date.now() + 60_000 } };
    mountPlay(host, context(vi.fn(), [], blocked), pandasClient, 'c:1');
    await settle();
    attemptAll(host, [0]);
    await settle();
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('.modal-buttons button')];
    expect(buttons.map((button) => button.textContent)).toEqual(['← Retour']);
    expect(buttons[0]?.classList.contains('primary')).toBe(true);
  });
});

describe('niveau bloqué', () => {
  it('n’ouvre pas la grille d’un niveau perdu il y a peu, et dit dans combien de minutes il se rejoue', async () => {
    const host = document.createElement('div');
    const blocked = { ...state, lockedUntil: { 'c:1': Date.now() + 2 * 60_000 + 30_000 } };
    mountPlay(host, context(vi.fn(), [], blocked), pandasClient, 'c:1');
    await settle();
    expect(host.querySelector('.pd-cell')).toBeNull();
    expect(host.querySelector('.empty h2')?.textContent).toBe(PLATFORM_STRINGS.fr.cooldown);
    expect(host.textContent).toContain(PLATFORM_STRINGS.fr.cooldownHint(3));
  });

  it('ouvre la grille une fois le blocage échu', async () => {
    const host = document.createElement('div');
    const expired = { ...state, lockedUntil: { 'c:1': Date.now() - 1 } };
    mountPlay(host, context(vi.fn(), [], expired), pandasClient, 'c:1');
    await settle();
    expect(host.querySelector('.pd-cell')).not.toBeNull();
  });
});

describe('course rejointe', () => {
  const racers = (count: number): Presence[] =>
    ['p1', 'p2', 'p3', 'p4'].slice(0, count).map((player) => ({
      player,
      name: player,
      game: 'pandas',
      key: 'c:5',
      state: null,
      value: 0,
    }));

  it('rejoint aux Pandas un niveau verrouillé où trois amis font déjà la course, avec leurs trois aperçus', async () => {
    const host = document.createElement('div');
    mountPlay(host, context(vi.fn(), racers(3)), pandasClient, 'c:5');
    await settle();
    expect(host.querySelectorAll('.live-board')).toHaveLength(3);
    expect(host.querySelector('.pd-cell')).not.toBeNull();
  });

  it('refuse une course de Pandas déjà à quatre joueurs', async () => {
    const host = document.createElement('div');
    mountPlay(host, context(vi.fn(), racers(4)), pandasClient, 'c:5');
    await settle();
    expect(host.querySelector('.pd-cell')).toBeNull();
    expect(host.textContent).toContain('Cette course est complète : 4 joueurs au plus.');
  });
});
