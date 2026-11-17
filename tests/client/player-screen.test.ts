import { describe, expect, it, vi } from 'vitest';
import { fiolesClient } from '../../src/client/games/fioles/index.ts';
import { pandasClient } from '../../src/client/games/pandas/index.ts';
import { ApiClient } from '../../src/client/platform/api.ts';
import { ChatStore } from '../../src/client/platform/chat.ts';
import type { AppContext } from '../../src/client/platform/context.ts';
import { LiveClient } from '../../src/client/platform/live.ts';
import { mountPlayer } from '../../src/client/platform/screens/player.ts';
import { createLocalStore } from '../../src/client/platform/storage.ts';
import { PLATFORM_STRINGS } from '../../src/client/platform/strings.ts';
import type { Account, PlayerGameDetail, RunSummary } from '../../src/shared/platform/protocol.ts';

const me: Account = { id: 'abc123', name: 'Léa', created: 1, login: 'lea', avatar: '🐶' };

const run = (key: string, value: number, id: string): RunSummary => ({
  id,
  game: 'fioles',
  key,
  player: me.id,
  status: 'won',
  value,
  durationMs: 1000,
  ended: 1,
});

const detail: PlayerGameDetail = {
  player: me,
  progress: { player: me.id, completed: 2, runs: 24, playTimeMs: 60_000, lastPlayed: 1 },
  keys: [
    {
      key: 'c:1',
      attempts: 12,
      firstWinAttempts: 3,
      firstWinDurationMs: 9000,
      best: run('c:1', 9, 'r1'),
      rank: 1,
      replayVisible: true,
    },
    {
      key: 'c:2',
      attempts: 2,
      firstWinAttempts: 1,
      firstWinDurationMs: 140_000,
      best: run('c:2', 999, 'r2'),
      rank: 4,
      replayVisible: true,
    },
  ],
};

function context(): AppContext {
  const api = new ApiClient(vi.fn(async () => new Response(JSON.stringify(detail))));
  return {
    api,
    live: new LiveClient(() => {
      throw new Error('pas de connexion dans ce test');
    }, 'ws://test'),
    chat: new ChatStore(api, createLocalStore(null), me.id),
    lang: 'fr',
    t: PLATFORM_STRINGS.fr,
    me,
    navigate: vi.fn(),
    setLang: vi.fn(),
    setMe: vi.fn(),
    logout: vi.fn(async () => undefined),
  };
}

describe('fiche d’un joueur', () => {
  it('montre les essais jusqu’à la première victoire, son temps, le diamant et la médaille du podium', async () => {
    const host = document.createElement('div');
    mountPlayer(host, context(), fiolesClient, me.id);
    await vi.waitFor(() => expect(host.querySelectorAll('.list-row')).toHaveLength(2));

    const [first, second] = [...host.querySelectorAll<HTMLElement>('.list-row')];
    expect(first?.querySelector('small')?.textContent).toBe('Essais 12 · 1re victoire - 9 s - 3 essais');
    expect(first?.querySelector('strong')?.textContent).toContain('💎');
    expect(first?.querySelector('strong')?.textContent).toContain('🥇');
    expect(first?.querySelector<HTMLElement>('.key-badge')?.getAttribute('title')).toBe(
      PLATFORM_STRINGS.fr.perfectScore,
    );

    // Quatrième du niveau : pas de médaille. Victoire au premier essai : « 1 essai » au singulier.
    expect(second?.querySelector('small')?.textContent).toBe('Essais 2 · 1re victoire - 2 min 20 s - 1 essai');
    expect(second?.querySelector('strong')?.textContent).not.toContain('🥇');
    expect(second?.querySelectorAll('.key-badge')).toHaveLength(0);

    expect(host.textContent).not.toContain('Victoires');
    expect(host.textContent).toContain('Essais 12');
  });

  it('garde essais, temps et replay d’un jeu sans score, sans diamant, médaille ni score', async () => {
    const host = document.createElement('div');
    mountPlayer(host, context(), pandasClient, me.id);
    await vi.waitFor(() => expect(host.querySelectorAll('.list-row')).toHaveLength(2));
    const first = host.querySelector<HTMLElement>('.list-row');
    expect(first?.querySelector('small')?.textContent).toBe('Essais 12 · 1re victoire - 9 s - 3 essais');
    expect(host.querySelectorAll('.key-badge')).toHaveLength(0);
    expect(first?.querySelector('button')?.textContent).toBe(PLATFORM_STRINGS.fr.watchReplay);
  });
});
