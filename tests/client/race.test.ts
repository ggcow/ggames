import { describe, expect, it, vi } from 'vitest';
import { avatarOf } from '../../src/client/platform/avatar.ts';
import { canJoinRace, createGameView, RACE_SIZE, rivalsOn } from '../../src/client/platform/context.ts';
import { recordBadge, scoreList } from '../../src/client/platform/screens/play.ts';
import { PLATFORM_STRINGS } from '../../src/client/platform/strings.ts';
import type { GameState, Presence } from '../../src/shared/platform/protocol.ts';

const presence = (player: string, game: string | null, key: string | null): Presence => ({
  player,
  name: player,
  game,
  key,
  state: null,
  value: 0,
});

describe('course en direct', () => {
  it('trouve les autres joueurs sur la même clé du même jeu', () => {
    const online = [
      presence('me', 'fioles', 'c:3'),
      presence('léa', 'fioles', 'c:3'),
      presence('tom', 'fioles', 'c:4'),
      presence('zoé', 'autre', 'c:3'),
      presence('max', null, null),
      presence('ana', 'fioles', 'c:3'),
    ];
    expect(rivalsOn(online, 'me', 'fioles', 'c:3').map((p) => p.player)).toEqual(['léa', 'ana']);
  });

  it('accepte un joueur de plus tant que la course n’a pas trois joueurs', () => {
    expect(RACE_SIZE).toBe(3);
    expect(canJoinRace(0)).toBe(false);
    expect(canJoinRace(1)).toBe(true);
    expect(canJoinRace(2)).toBe(true);
    expect(canJoinRace(3)).toBe(false);
  });
});

describe('badge du record', () => {
  const state = (records: GameState['records']): GameState => ({
    players: [
      { id: 'p1', name: 'Léa', created: 1, avatar: null },
      { id: 'p2', name: 'Tom', created: 2, avatar: null },
      { id: 'p3', name: 'Zoé', created: 3, avatar: null },
      { id: 'p4', name: 'Max', created: 4, avatar: null },
      { id: 'p5', name: 'Inès', created: 5, avatar: null },
    ],
    progress: [],
    records,
  });
  const moves = (value: number) => `${value} coups`;

  it('montre le détenteur et son score, avec la phrase complète en titre', () => {
    const view = createGameView(state({ 'c:1': [{ player: 'p1', value: 12, run: 'r1' }] }), 'p1', 'fr');
    const badge = recordBadge(view, 'c:1', moves, PLATFORM_STRINGS.fr, null, vi.fn());
    expect(badge?.textContent).toBe(`🏆${avatarOf('p1')}12 coups`);
    expect(badge?.getAttribute('title')).toBe('Record : Léa (12 coups)');
    expect(badge?.querySelector('.avatar')).not.toBeNull();
  });

  it('ne montre rien sans record ou pour un jeu sans score', () => {
    const view = createGameView(state({ 'c:1': [{ player: 'p1', value: 12, run: 'r1' }] }), 'p1', 'fr');
    expect(recordBadge(view, 'c:2', moves, PLATFORM_STRINGS.fr, null, vi.fn())).toBeNull();
    expect(recordBadge(view, 'c:1', null, PLATFORM_STRINGS.fr, null, vi.fn())).toBeNull();
  });

  it('montre tous les détenteurs d’un record partagé et ouvre le podium', () => {
    const records = [
      { player: 'p2', value: 12, run: 'r2' },
      { player: 'p1', value: 12, run: 'r1' },
      { player: 'p3', value: 14, run: 'r3' },
    ];
    const view = createGameView(state({ 'c:1': records }), 'p1', 'fr');
    const openPodium = vi.fn();
    const badge = recordBadge(view, 'c:1', moves, PLATFORM_STRINGS.fr, null, openPodium);
    expect(badge?.querySelectorAll('.avatar')).toHaveLength(2);
    expect(badge?.getAttribute('title')).toBe('Record : Tom, Léa (12 coups)');
    badge?.click();
    expect(openPodium).toHaveBeenCalledOnce();
  });

  it('résume au-delà de trois détenteurs ex æquo', () => {
    const records = ['p1', 'p2', 'p3', 'p4', 'p5'].map((player) => ({ player, value: 9, run: `r${player}` }));
    const view = createGameView(state({ 'c:1': records }), 'p1', 'fr');
    const badge = recordBadge(view, 'c:1', moves, PLATFORM_STRINGS.fr, null, vi.fn());
    expect(badge?.querySelectorAll('.avatar')).toHaveLength(3);
    expect(badge?.querySelector('small')?.textContent).toBe('+2');
  });
});

describe('classement d’un niveau', () => {
  const view = createGameView(
    {
      players: ['p1', 'p2', 'p3', 'p4', 'p5'].map((id, index) => ({ id, name: id, created: index, avatar: null })),
      progress: [],
      records: {},
    },
    'p2',
    'fr',
  );
  const records = [
    { player: 'p1', value: 10, run: 'r1' },
    { player: 'p2', value: 10, run: 'r2' },
    { player: 'p3', value: 11, run: 'r3' },
    { player: 'p4', value: 11, run: 'r4' },
    { player: 'p5', value: 13, run: 'r5' },
  ];
  const ranks = (list: HTMLElement) => [...list.querySelectorAll('.rank')].map((rank) => rank.textContent);

  it('partage le rang des ex æquo et marque sa propre ligne', () => {
    const list = scoreList(records, view, (value) => `${value} coups`, null);
    expect(ranks(list)).toEqual(['1', '1', '3', '3', '5']);
    expect(list.querySelectorAll('li.me')).toHaveLength(1);
    expect(list.querySelector('li.me')?.textContent).toContain('p2');
  });

  it('garde au podium tous les ex æquo des trois premiers rangs', () => {
    const podium = scoreList(records, view, (value) => `${value} coups`, null, 3);
    expect(ranks(podium)).toEqual(['1', '1', '3', '3']);
  });
});

describe('meilleur score possible', () => {
  const view = createGameView(
    { players: [{ id: 'p1', name: 'Léa', created: 1, avatar: null }], progress: [], records: {} },
    'p1',
    'fr',
  );

  it('marque d’un diamant le badge du record et chaque score parfait du classement', () => {
    const records = [
      { player: 'p1', value: 9, run: 'r1' },
      { player: 'p2', value: 11, run: 'r2' },
    ];
    const withRecords = { ...view, state: { ...view.state, records: { 'c:1': records } } };
    const badge = recordBadge(withRecords, 'c:1', (value) => `${value} coups`, PLATFORM_STRINGS.fr, 9, vi.fn());
    expect(badge?.textContent?.startsWith('💎')).toBe(true);
    const list = scoreList(records, view, (value) => `${value} coups`, 9);
    expect([...list.querySelectorAll('b')].map((b) => b.textContent)).toEqual(['💎 9 coups', '11 coups']);
  });
});
