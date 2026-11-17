import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../../src/client/platform/api.ts';
import { ChatStore } from '../../src/client/platform/chat.ts';
import type { AppContext } from '../../src/client/platform/context.ts';
import { LiveClient } from '../../src/client/platform/live.ts';
import { renderLiveBoards, renderOnline } from '../../src/client/platform/screens/online.ts';
import { createLocalStore } from '../../src/client/platform/storage.ts';
import { PLATFORM_STRINGS } from '../../src/client/platform/strings.ts';
import { startBoard } from '../../src/shared/games/fioles/definition.ts';
import { boardToString } from '../../src/shared/games/fioles/rules.ts';
import { liveState } from '../../src/shared/games/pandas/rules.ts';
import type { Account, Presence } from '../../src/shared/platform/protocol.ts';
import { pandasLevel } from '../support/pandas.ts';

const me: Account = { id: 'abc123', name: 'Léa', created: 1, login: 'lea', avatar: '🐶' };
const t = PLATFORM_STRINGS.fr;

function context(navigate: (route: unknown) => void): AppContext {
  const api = new ApiClient(vi.fn(async () => new Response('[]')));
  return {
    api,
    live: new LiveClient(() => {
      throw new Error('pas de connexion dans ce test');
    }, 'ws://test'),
    chat: new ChatStore(api, createLocalStore(null), me.id),
    lang: 'fr',
    t,
    me,
    navigate,
    setLang: vi.fn(),
    setMe: vi.fn(),
    logout: vi.fn(async () => undefined),
  };
}

const presence = (player: string, game: string | null, key: string | null): Presence => ({
  player,
  name: player,
  game,
  key,
  state: null,
  value: 0,
});

describe('joueurs en ligne', () => {
  it('signale quand personne d’autre n’est en ligne', () => {
    expect(renderOnline([], context(vi.fn())).textContent).toBe(t.nobodyOnline);
  });

  it('entoure d’une aura et marque « Rejoindre » un joueur en partie, qu’un toucher rejoint', () => {
    const navigate = vi.fn();
    const list = renderOnline([presence('Tom', 'fioles', 'c:4'), presence('Zoé', null, null)], context(navigate));
    const [playing, idle] = [...list.querySelectorAll<HTMLButtonElement>('.online-chip')];
    expect(playing?.classList.contains('joinable')).toBe(true);
    expect(playing?.querySelector('.online-join')?.textContent).toBe(t.join);
    expect(playing?.disabled).toBe(false);
    playing?.click();
    expect(navigate).toHaveBeenCalledExactlyOnceWith({ name: 'play', game: 'fioles', key: 'c:4' });

    expect(idle?.classList.contains('joinable')).toBe(false);
    expect(idle?.querySelector('.online-join')).toBeNull();
    expect(idle?.disabled).toBe(true);
    expect(idle?.textContent).toContain(t.inMenus);
  });
});

describe('aperçus en direct', () => {
  const racer = (player: string, game: string, state: string, value: number): Presence => ({
    player,
    name: player,
    game,
    key: 'c:1',
    state,
    value,
  });

  it('place deux aperçus côte à côte et le score à côté du nom', () => {
    const board = startBoard('c:1');
    if (!board) throw new Error('niveau 1 introuvable');
    const state = boardToString(board);
    const others = ['Tom', 'Zoé', 'Max'].map((name) => racer(name, 'fioles', state, 4));
    const boards = renderLiveBoards(others, context(vi.fn()), 'fioles');
    expect(boards?.classList.contains('compact')).toBe(false);
    expect(boards?.style.getPropertyValue('--previews')).toBe('2');
    const cards = boards?.querySelectorAll('.live-board') ?? [];
    expect(cards).toHaveLength(2);
    expect(cards[0]?.querySelector('.live-board-head small')?.textContent).toBe('4 coups');
  });

  it('place trois aperçus resserrés aux Pandas, les vies à côté du nom', () => {
    const state = liveState(pandasLevel(1), [], 1);
    const others = ['Tom', 'Zoé', 'Max', 'Ana'].map((name) => racer(name, 'pandas', state, 1));
    const boards = renderLiveBoards(others, context(vi.fn()), 'pandas');
    expect(boards?.classList.contains('compact')).toBe(true);
    expect(boards?.style.getPropertyValue('--previews')).toBe('3');
    const cards = boards?.querySelectorAll('.live-board') ?? [];
    expect(cards).toHaveLength(3);
    expect(cards[2]?.querySelector('.live-board-head strong')?.textContent).toBe('Max');
    expect(cards[2]?.querySelector('.live-board-head small')?.textContent).toBe('❤️❤️🖤');
  });

  it('ne montre rien sans autre joueur ni pour un jeu inconnu', () => {
    expect(renderLiveBoards([], context(vi.fn()), 'pandas')).toBeNull();
    expect(renderLiveBoards([presence('Tom', 'x', 'c:1')], context(vi.fn()), 'x')).toBeNull();
  });
});
