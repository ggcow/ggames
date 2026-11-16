import { describe, expect, it } from 'vitest';
import { avatarOf } from '../../src/client/platform/avatar.ts';
import { canJoinRace, createGameView, RACE_SIZE, rivalsOn } from '../../src/client/platform/context.ts';
import { recordBadge } from '../../src/client/platform/screens/play.ts';
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
    players: [{ id: 'p1', name: 'Léa', created: 1, avatar: null }],
    progress: [],
    records,
  });
  const moves = (value: number) => `${value} coups`;

  it('montre le détenteur et son score, avec la phrase complète en titre', () => {
    const view = createGameView(state({ 'c:1': [{ player: 'p1', value: 12, run: 'r1' }] }), 'p1', 'fr');
    const badge = recordBadge(view, 'c:1', moves, PLATFORM_STRINGS.fr);
    expect(badge?.textContent).toBe(`🏆${avatarOf('p1')}12 coups`);
    expect(badge?.getAttribute('title')).toBe('Record : Léa (12 coups)');
    expect(badge?.querySelector('.avatar')).not.toBeNull();
  });

  it('ne montre rien sans record ou pour un jeu sans score', () => {
    const view = createGameView(state({ 'c:1': [{ player: 'p1', value: 12, run: 'r1' }] }), 'p1', 'fr');
    expect(recordBadge(view, 'c:2', moves, PLATFORM_STRINGS.fr)).toBeNull();
    expect(recordBadge(view, 'c:1', null, PLATFORM_STRINGS.fr)).toBeNull();
  });
});
