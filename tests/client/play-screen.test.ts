import { afterEach, describe, expect, it, vi } from 'vitest';
import { pandasClient } from '../../src/client/games/pandas/index.ts';
import { ApiClient } from '../../src/client/platform/api.ts';
import { ChatStore } from '../../src/client/platform/chat.ts';
import type { AppContext } from '../../src/client/platform/context.ts';
import { LiveClient } from '../../src/client/platform/live.ts';
import { mountPlay } from '../../src/client/platform/screens/play.ts';
import { createLocalStore } from '../../src/client/platform/storage.ts';
import { PLATFORM_STRINGS } from '../../src/client/platform/strings.ts';
import { closeModals } from '../../src/client/platform/ui.ts';
import type { Account, GameState, SubmitRunResponse } from '../../src/shared/platform/protocol.ts';
import { pandasLevel, pandasSolution } from '../support/pandas.ts';

const me: Account = { id: 'abc123', name: 'Léa', created: 1, login: 'lea', avatar: '🐶' };
const state: GameState = { players: [me], progress: [], records: {} };
const won: SubmitRunResponse = {
  run: { id: 'r1', game: 'pandas', key: 'c:1', player: me.id, status: 'won', value: 5, durationMs: 1, ended: 1 },
  records: [{ player: me.id, value: 5, run: 'r1' }],
};

/** Contexte réel, sans réseau : l'API simulée sert la partie et accepte la victoire. */
function context(navigate: (route: unknown) => void): AppContext {
  const api = new ApiClient(
    vi.fn(async (input: string) => {
      if (input === '/api/games/pandas') return new Response(JSON.stringify(state));
      if (input === '/api/games/pandas/runs') return new Response(JSON.stringify(won));
      return new Response(JSON.stringify([]));
    }),
  );
  return {
    api,
    live: new LiveClient(() => {
      throw new Error('pas de connexion dans ce test');
    }, 'ws://test'),
    chat: new ChatStore(api, createLocalStore(null), me.id),
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

describe('fin de partie', () => {
  afterEach(closeModals);

  it('propose de rejouer le niveau gagné, qui repart d’une grille vide', async () => {
    const navigate = vi.fn();
    const host = document.createElement('div');
    mountPlay(host, context(navigate), pandasClient, 'c:1');
    await settle();
    const cells = () => [...host.querySelectorAll<HTMLButtonElement>('.pd-cell')];
    for (const cell of pandasSolution(pandasLevel(1))) {
      cells()[cell]?.click();
      cells()[cell]?.click();
    }
    await settle();
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('.modal-buttons button')];
    expect(buttons.map((button) => button.textContent)).toEqual(['Suivant', '⟲ Rejouer', '← Retour']);
    buttons[1]?.click();
    expect(document.querySelector('.modal')).toBeNull();
    expect(host.querySelectorAll('.pd-cell.panda')).toHaveLength(0);
    expect(host.querySelector('.counter')?.textContent).toBe('0 coups');
    expect(navigate).not.toHaveBeenCalled();
  });
});
