import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LevelTile } from '../../src/client/games/client-game.ts';
import { avatar, avatarOf, setAvatar, setAvatars, takenAvatars } from '../../src/client/platform/avatar.ts';
import {
  currentPage,
  type PlayerPosition,
  pageCount,
  pageLevels,
  pageOfLevel,
  playerPositions,
  renderLevelGrid,
} from '../../src/client/platform/level-grid.ts';
import { PLATFORM_STRINGS } from '../../src/client/platform/strings.ts';
import { derivedAvatar } from '../../src/shared/platform/avatars.ts';
import type { Presence } from '../../src/shared/platform/protocol.ts';

describe('pagination', () => {
  it.each([
    [{ unlocked: 1, total: 9999 }, 1, 0],
    [{ unlocked: 19, total: 9999 }, 1, 0],
    [{ unlocked: 20, total: 9999 }, 2, 0],
    [{ unlocked: 21, total: 9999 }, 2, 1],
    [{ unlocked: 45, total: 9999 }, 3, 2],
    [{ unlocked: 30, total: 30 }, 2, 1],
  ])('progression %j : %i page(s), page courante %i', (progress, pages, current) => {
    expect(pageCount(progress)).toBe(pages);
    expect(currentPage(progress)).toBe(current);
  });

  it('liste les niveaux d’une page, bornés au total', () => {
    expect(pageLevels(0, { unlocked: 1, total: 9999 })).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(pageLevels(1, { unlocked: 30, total: 25 })).toEqual([21, 22, 23, 24, 25]);
    expect(pageLevels(2, { unlocked: 1, total: 25 })).toEqual([]);
  });
});

describe('grille', () => {
  const tile = (level: number): LevelTile => {
    if (level <= 2) {
      return {
        key: `c:${level}`,
        label: String(level),
        status: 'done',
        perfect: level === 2,
        holders: level === 2 ? [{ player: 'abc123', name: 'léa' }] : [],
        recordPerfect: level === 2,
      };
    }
    const empty = { perfect: false, holders: [], recordPerfect: false };
    if (level === 3) return { key: 'c:3', label: '3', status: 'open', ...empty };
    return { key: `c:${level}`, label: String(level), status: 'locked', ...empty };
  };
  const positions: PlayerPosition[] = [
    { player: 'abc123', name: 'léa', level: 2, live: true, me: true },
    { player: 'def456', name: 'Tom', level: 3, live: false, me: false },
  ];

  const render = (page = 0, onPage = vi.fn(), onPlay = vi.fn()) =>
    renderLevelGrid({
      progress: { unlocked: 3, total: 9999 },
      page,
      tile,
      positions,
      t: PLATFORM_STRINGS.fr,
      onPage,
      onPlay,
    });

  it('affiche une page de 20 cases avec leur état', () => {
    const grid = render();
    const cells = [...grid.querySelectorAll<HTMLButtonElement>('.level')];
    expect(cells).toHaveLength(20);
    expect(cells[0]?.classList.contains('done')).toBe(true);
    expect(cells[0]?.textContent).toBe('1');
    expect(cells[2]?.classList.contains('open')).toBe(true);
    expect(cells[3]?.disabled).toBe(true);
    expect(cells[3]?.textContent).toBe('🔒');
    expect(grid.querySelector('.pager-label')?.textContent).toContain('1 – 20');
  });

  it('montre seulement un 💎 sur un niveau réussi avec le meilleur score possible', () => {
    const cells = [...render().querySelectorAll<HTMLButtonElement>('.level')];
    expect(cells[0]?.classList.contains('perfect')).toBe(false);
    expect(cells[0]?.querySelector('.level-perfect, .level-holders')).toBeNull();
    expect(cells[1]?.classList.contains('perfect')).toBe(true);
    expect(cells[1]?.querySelector('.level-perfect')?.textContent).toBe('💎');
    expect(cells[1]?.querySelector('.level-holders')).toBeNull();
    expect(cells[1]?.getAttribute('aria-label')).toBe('2 réussi, Score parfait — léa (en jeu)');
  });

  const holdersGrid = (holders: LevelTile['holders'], recordPerfect = false) =>
    renderLevelGrid({
      progress: { unlocked: 2, total: 9999 },
      page: 0,
      tile: (level) => ({
        key: `c:${level}`,
        label: String(level),
        status: level === 1 ? 'done' : 'open',
        perfect: false,
        holders,
        recordPerfect,
      }),
      positions: [],
      t: PLATFORM_STRINGS.fr,
      onPage: vi.fn(),
      onPlay: vi.fn(),
    });

  it('montre à qui n’a pas le 💎 l’avatar du détenteur du record, sans diamant si ce record n’est pas parfait', () => {
    const cells = holdersGrid([{ player: 'aaa111', name: 'Léa' }]).querySelectorAll<HTMLElement>('.level');
    const holders = cells[0]?.querySelector('.level-holders');
    expect(holders?.querySelectorAll('.avatar')).toHaveLength(1);
    expect(holders?.classList.contains('perfect')).toBe(false);
    expect(holders?.getAttribute('title')).toBe('Record : Léa');
    expect(cells[0]?.querySelector('.level-perfect')).toBeNull();
    expect(cells[0]?.getAttribute('aria-label')).toBe('1 réussi, Record : Léa');
    // Sur un niveau pas encore réussi, la case garde seulement son numéro et l'action proposée.
    expect(cells[1]?.querySelector('.level-holders')).toBeNull();
  });

  it('marque d’un petit 💎 le détenteur d’un record parfait', () => {
    const holders = holdersGrid([{ player: 'aaa111', name: 'Léa' }], true).querySelector('.level-holders');
    expect(holders?.classList.contains('perfect')).toBe(true);
    expect(holders?.getAttribute('title')).toBe('Record : Léa, Score parfait');
  });

  it('montre tous les détenteurs ex æquo du record, résumés au-delà de deux', () => {
    const tied = holdersGrid([
      { player: 'aaa111', name: 'Léa' },
      { player: 'bbb222', name: 'Tom' },
      { player: 'ccc333', name: 'Zoé' },
    ]);
    const holders = tied.querySelector('.level-holders');
    expect(holders?.querySelectorAll('.avatar:not(.more)')).toHaveLength(2);
    expect(holders?.querySelector('.avatar.more')?.textContent).toBe('+1');
    expect(holders?.getAttribute('title')).toBe('Record : Léa, Tom, Zoé');
  });

  it('ne montre rien sous le numéro sans détenteur de record', () => {
    const cell = holdersGrid([]).querySelector('.level.done');
    expect(cell?.textContent).toBe('1');
    expect(cell?.getAttribute('aria-label')).toBe('1 réussi');
  });

  it('lance un niveau jouable et ignore un niveau verrouillé', () => {
    const onPlay = vi.fn();
    const cells = [...render(0, vi.fn(), onPlay).querySelectorAll<HTMLButtonElement>('.level')];
    cells[2]?.click();
    cells[5]?.click();
    expect(onPlay).toHaveBeenCalledExactlyOnceWith('c:3');
  });

  it('place chaque joueur sur son niveau, en direct ou non', () => {
    const cells = render().querySelectorAll('.level');
    expect(cells[1]?.querySelector('.level-live .avatar.live')?.getAttribute('aria-label')).toBe('léa — en jeu');
    expect(cells[2]?.querySelector('.level-live .avatar')?.getAttribute('aria-label')).toMatch(/^Tom — /);
    expect(cells[2]?.querySelector('.level-live .avatar.live')).toBeNull();
    expect(cells[0]?.querySelector('.level-live .avatar')).toBeNull();
  });

  it('propose de rejoindre un niveau verrouillé qu’un ami joue en direct', () => {
    const onPlay = vi.fn();
    const grid = renderLevelGrid({
      progress: { unlocked: 3, total: 9999 },
      page: 0,
      tile,
      positions: [{ player: 'abc123', name: 'Léa', level: 8, live: true, me: false }],
      t: PLATFORM_STRINGS.fr,
      onPage: vi.fn(),
      onPlay,
    });
    const cell = grid.querySelectorAll<HTMLButtonElement>('.level')[7];
    expect(cell?.classList.contains('join')).toBe(true);
    expect(cell?.disabled).toBe(false);
    expect(cell?.textContent).toContain('Rejoindre');
    cell?.click();
    expect(onPlay).toHaveBeenCalledWith('c:8');
  });

  it('ne propose pas de rejoindre une course déjà complète', () => {
    const grid = renderLevelGrid({
      progress: { unlocked: 3, total: 9999 },
      page: 0,
      tile,
      positions: ['a1', 'b2', 'c3'].map((player) => ({ player, name: player, level: 8, live: true, me: false })),
      t: PLATFORM_STRINGS.fr,
      onPage: vi.fn(),
      onPlay: vi.fn(),
    });
    const cell = grid.querySelectorAll<HTMLButtonElement>('.level')[7];
    expect(cell?.classList.contains('locked')).toBe(true);
    expect(cell?.disabled).toBe(true);
  });

  it('permet d’aller jusqu’à la page du joueur le plus avancé', () => {
    const grid = renderLevelGrid({
      progress: { unlocked: 3, total: 9999 },
      page: 0,
      tile,
      positions: [{ player: 'abc123', name: 'Léa', level: 45, live: false, me: false }],
      t: PLATFORM_STRINGS.fr,
      onPage: vi.fn(),
      onPlay: vi.fn(),
    });
    expect(grid.querySelector('.pager-label small')?.textContent).toBe('page 1 / 3');
  });

  it('limite les avatars d’une case et affiche le nombre restant', () => {
    const crowd = ['a1', 'b2', 'c3', 'd4', 'e5'].map((id) => ({
      player: `${id}xxxx`,
      name: id,
      level: 1,
      live: false,
      me: false,
    }));
    const grid = renderLevelGrid({
      progress: { unlocked: 3, total: 9999 },
      page: 0,
      tile,
      positions: crowd,
      t: PLATFORM_STRINGS.fr,
      onPage: vi.fn(),
      onPlay: vi.fn(),
    });
    const markers = grid.querySelectorAll('.level')[0]?.querySelectorAll('.level-live .avatar');
    expect(markers).toHaveLength(4);
    expect(markers?.[3]?.textContent).toBe('+2');
  });

  it('change de page avec les flèches, sans dépasser les bornes', () => {
    const onPage = vi.fn();
    const [previous, next] = [...render(0, onPage).querySelectorAll<HTMLButtonElement>('.pager button')];
    expect(previous?.disabled).toBe(true);
    expect(next?.disabled).toBe(true);
    const twoPages = renderLevelGrid({
      progress: { unlocked: 25, total: 9999 },
      page: 0,
      tile,
      positions: [],
      t: PLATFORM_STRINGS.fr,
      onPage,
      onPlay: vi.fn(),
    });
    twoPages.querySelectorAll<HTMLButtonElement>('.pager button')[1]?.click();
    expect(onPage).toHaveBeenCalledWith(1);
  });
});

describe('avatars', () => {
  afterEach(() => setAvatars([]));

  it('donne à chaque joueur l’animal tiré de son identifiant par défaut', () => {
    expect(avatarOf('abc123')).toBe(derivedAvatar('abc123'));
    const element = avatar('abc123', 'Tom', 'md');
    expect(element.classList.contains('md')).toBe(true);
    expect(element.textContent).toBe(derivedAvatar('abc123'));
    expect(element.getAttribute('aria-label')).toBe('Tom');
  });

  it('affiche l’animal choisi par chaque joueur', () => {
    setAvatars([
      { id: 'abc123', name: 'Tom', created: 1, avatar: '🦄' },
      { id: 'def456', name: 'Léa', created: 2, avatar: null },
    ]);
    expect(avatar('abc123', 'Tom').textContent).toBe('🦄');
    expect(avatarOf('def456')).toBe(derivedAvatar('def456'));
    setAvatar('def456', '🐙');
    expect(avatarOf('def456')).toBe('🐙');
    setAvatar('def456', null);
    expect(avatarOf('def456')).toBe(derivedAvatar('def456'));
  });

  it('liste les animaux pris par les autres joueurs', () => {
    setAvatars([
      { id: 'abc123', name: 'Tom', created: 1, avatar: '🦄' },
      { id: 'def456', name: 'Léa', created: 2, avatar: '🐙' },
    ]);
    expect(takenAvatars('abc123')).toEqual(new Set(['🐙']));
  });
});

describe('traduction automatique', () => {
  it('soustrait numéros et avatars à la traduction automatique du navigateur', () => {
    const grid = renderLevelGrid({
      progress: { unlocked: 2, total: 9999 },
      page: 0,
      tile: (level) => ({
        key: `c:${level}`,
        label: String(level),
        status: level === 1 ? 'done' : 'open',
        perfect: false,
        recordPerfect: false,
        holders: [
          { player: 'aaa111', name: 'Léa' },
          { player: 'bbb222', name: 'Tom' },
          { player: 'ccc333', name: 'Zoé' },
        ],
      }),
      positions: [],
      t: PLATFORM_STRINGS.fr,
      onPage: vi.fn(),
      onPlay: vi.fn(),
    });
    const numbers = [...grid.querySelectorAll('.level-number, .level-holders .avatar')];
    expect(numbers.length).toBeGreaterThan(3);
    for (const element of numbers) expect(element.getAttribute('translate')).toBe('no');
    // « Jouer » reste traduisible.
    expect(grid.querySelector('.level.open .level-hint')?.getAttribute('translate')).toBeNull();
  });
});

describe('positions des joueurs', () => {
  const players = [
    { id: 'aaa111', name: 'Léa', created: 1, avatar: null },
    { id: 'bbb222', name: 'Tom', created: 2, avatar: null },
    { id: 'ccc333', name: 'Zoé', created: 3, avatar: null },
  ];
  const unlocked: Record<string, number> = { aaa111: 5, bbb222: 12, ccc333: 5 };
  const presence = (player: string, game: string, key: string | null): Presence => ({
    player,
    name: '',
    game,
    key,
    state: null,
    value: 0,
  });

  it('prend le plus haut niveau débloqué, ou le niveau joué en direct, et trie du plus avancé', () => {
    const positions = playerPositions({
      players,
      online: [presence('ccc333', 'fioles', 'c:2'), presence('aaa111', 'autre', 'c:40')],
      gameId: 'fioles',
      me: 'aaa111',
      unlockedOf: (id) => unlocked[id] ?? 1,
      played: () => true,
      levelOf: (key) => Number(key.slice(2)),
    });
    expect(positions).toEqual([
      { player: 'bbb222', name: 'Tom', level: 12, live: false, me: false },
      { player: 'aaa111', name: 'Léa', level: 5, live: false, me: true },
      { player: 'ccc333', name: 'Zoé', level: 2, live: true, me: false },
    ]);
  });

  it('ignore une présence sur une clé qui n’est pas un niveau', () => {
    const [position] = playerPositions({
      players: [players[0] as (typeof players)[number]],
      online: [presence('aaa111', 'fioles', 'menu')],
      gameId: 'fioles',
      me: 'aaa111',
      unlockedOf: () => 3,
      played: () => true,
      levelOf: () => null,
    });
    expect(position).toMatchObject({ level: 3, live: false, me: true });
  });

  it('écarte un joueur qui n’a jamais joué à ce jeu, sauf s’il y joue en direct', () => {
    const positions = playerPositions({
      players,
      online: [presence('ccc333', 'fioles', 'c:1')],
      gameId: 'fioles',
      me: 'aaa111',
      unlockedOf: () => 1,
      played: (id) => id === 'bbb222',
      levelOf: (key) => Number(key.slice(2)),
    });
    expect(positions.map((position) => position.player)).toEqual(['bbb222', 'ccc333']);
  });

  it('trouve la page d’un niveau', () => {
    expect([1, 20, 21, 45].map((level) => pageOfLevel(level))).toEqual([0, 0, 1, 2]);
  });
});
