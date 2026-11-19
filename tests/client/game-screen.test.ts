import { describe, expect, it, vi } from 'vitest';
import { fiolesClient } from '../../src/client/games/fioles/index.ts';
import { ApiClient } from '../../src/client/platform/api.ts';
import { ChatStore } from '../../src/client/platform/chat.ts';
import type { AppContext } from '../../src/client/platform/context.ts';
import { Installer } from '../../src/client/platform/install.ts';
import { LiveClient } from '../../src/client/platform/live.ts';
import { mountGame } from '../../src/client/platform/screens/game.ts';
import { createLocalStore } from '../../src/client/platform/storage.ts';
import { PLATFORM_STRINGS } from '../../src/client/platform/strings.ts';
import type { Account, GameState } from '../../src/shared/platform/protocol.ts';

const me: Account = { id: 'abc123', name: 'Léa', created: 1, login: 'lea', avatar: '🐶' };
const state: GameState = { players: [me], progress: [], records: {} };

/** Contexte réel, sans réseau : la page du jeu et le salon reçoivent leurs données par l'API simulée. */
function context(navigate: (route: unknown) => void): AppContext {
  const api = new ApiClient(
    vi.fn(async (input: string) => new Response(JSON.stringify(input === '/api/games/fioles' ? state : []))),
  );
  return {
    api,
    live: new LiveClient(() => {
      throw new Error('pas de connexion dans ce test');
    }, 'ws://test'),
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

describe('page d’un jeu', () => {
  it('ramène au menu depuis un bouton du bandeau, sans en-tête à lui seul', async () => {
    const navigate = vi.fn();
    const host = document.createElement('div');
    const screen = mountGame(host, context(navigate), fiolesClient);
    await vi.waitFor(() => expect(host.querySelector('.game-hero')).not.toBeNull());

    expect(host.querySelector('.topbar')).toBeNull();
    const hero = host.querySelector('.game-hero');
    const back = hero?.querySelector<HTMLButtonElement>('button.round');
    expect(back?.getAttribute('aria-label')).toBe(PLATFORM_STRINGS.fr.back);

    back?.click();
    expect(navigate).toHaveBeenCalledWith({ name: 'hub' });
    screen.dispose?.();
  });
});
