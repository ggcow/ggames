import { describe, expect, it, vi } from 'vitest';
import type { LevelTile } from '../../src/client/games/client-game.ts';
import { avatar, avatarColor, initial } from '../../src/client/platform/avatar.ts';
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
    if (level <= 2) return { key: `c:${level}`, label: String(level), status: 'done', best: `${level * 10} coups` };
    if (level === 3) return { key: 'c:3', label: '3', status: 'open', best: null };
    return { key: `c:${level}`, label: String(level), status: 'locked', best: null };
  };
  const positions: PlayerPosition[] = [
    { player: 'abc123', name: 'léa', level: 2, live: true },
    { player: 'def456', name: 'Tom', level: 3, live: false },
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
    expect(cells[0]?.textContent).toContain('10 coups');
    expect(cells[2]?.classList.contains('open')).toBe(true);
    expect(cells[3]?.disabled).toBe(true);
    expect(cells[3]?.textContent).toBe('🔒');
    expect(grid.querySelector('.pager-label')?.textContent).toContain('1 – 20');
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
    expect(cells[1]?.querySelector('.avatar.live')?.textContent).toBe('L');
    expect(cells[2]?.querySelector('.avatar')?.textContent).toBe('T');
    expect(cells[2]?.querySelector('.avatar.live')).toBeNull();
    expect(cells[0]?.querySelector('.avatar')).toBeNull();
  });

  it('propose de rejoindre un niveau verrouillé qu’un ami joue en direct', () => {
    const onPlay = vi.fn();
    const grid = renderLevelGrid({
      progress: { unlocked: 3, total: 9999 },
      page: 0,
      tile,
      positions: [{ player: 'abc123', name: 'Léa', level: 8, live: true }],
      t: PLATFORM_STRINGS.fr,
      onPage: vi.fn(),
      onPlay,
    });
    const cell = grid.querySelectorAll<HTMLButtonElement>('.level')[7];
    expect(cell?.classList.contains('join')).toBe(true);
    expect(cell?.disabled).toBe(false);
    expect(cell?.textContent).toContain('Rejoindre');
    cell?.click();
    grid.querySelector<HTMLButtonElement>('.position')?.click();
    expect(onPlay).toHaveBeenNthCalledWith(1, 'c:8');
    expect(onPlay).toHaveBeenNthCalledWith(2, 'c:8');
  });

  it('permet d’aller jusqu’à la page du joueur le plus avancé', () => {
    const grid = renderLevelGrid({
      progress: { unlocked: 3, total: 9999 },
      page: 0,
      tile,
      positions: [{ player: 'abc123', name: 'Léa', level: 45, live: false }],
      t: PLATFORM_STRINGS.fr,
      onPage: vi.fn(),
      onPlay: vi.fn(),
    });
    expect(grid.querySelector('.pager-label small')?.textContent).toBe('page 1 / 3');
  });

  it('résume les positions et ouvre la page du niveau d’un joueur', () => {
    const onPage = vi.fn();
    const grid = renderLevelGrid({
      progress: { unlocked: 3, total: 9999 },
      page: 0,
      tile,
      positions: [{ player: 'abc123', name: 'Léa', level: 45, live: false }],
      t: PLATFORM_STRINGS.fr,
      onPage,
      onPlay: vi.fn(),
    });
    const chip = grid.querySelector<HTMLButtonElement>('.position');
    expect(chip?.textContent).toContain('Niv. 45');
    chip?.click();
    expect(onPage).toHaveBeenCalledWith(2);
  });

  it('limite les avatars d’une case et affiche le nombre restant', () => {
    const crowd = ['a1', 'b2', 'c3', 'd4', 'e5'].map((id) => ({
      player: `${id}xxxx`,
      name: id,
      level: 1,
      live: false,
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
    const markers = grid.querySelectorAll('.level')[0]?.querySelectorAll('.avatar');
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
  it('donne une couleur stable par joueur et l’initiale du pseudo', () => {
    expect(avatarColor('abc123')).toBe(avatarColor('abc123'));
    expect(initial('  léa')).toBe('L');
    expect(initial('小明')).toBe('小');
    expect(initial('')).toBe('?');
    expect(avatar('abc123', 'Tom', 'md').className).toBe('avatar md');
  });
});

describe('grille sans score', () => {
  it('marque un niveau réussi d’une coche quand le jeu n’a pas de score', () => {
    const grid = renderLevelGrid({
      progress: { unlocked: 2, total: 9999 },
      page: 0,
      tile: (level) => ({ key: `c:${level}`, label: String(level), status: level === 1 ? 'done' : 'open', best: null }),
      positions: [],
      t: PLATFORM_STRINGS.fr,
      onPage: vi.fn(),
      onPlay: vi.fn(),
    });
    expect(grid.querySelector('.level.done .level-best')?.textContent).toBe('✓');
  });
});

describe('positions des joueurs', () => {
  const players = [
    { id: 'aaa111', name: 'Léa', created: 1 },
    { id: 'bbb222', name: 'Tom', created: 2 },
    { id: 'ccc333', name: 'Zoé', created: 3 },
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
      unlockedOf: (id) => unlocked[id] ?? 1,
      levelOf: (key) => Number(key.slice(2)),
    });
    expect(positions).toEqual([
      { player: 'bbb222', name: 'Tom', level: 12, live: false },
      { player: 'aaa111', name: 'Léa', level: 5, live: false },
      { player: 'ccc333', name: 'Zoé', level: 2, live: true },
    ]);
  });

  it('ignore une présence sur une clé qui n’est pas un niveau', () => {
    const [position] = playerPositions({
      players: [players[0] as (typeof players)[number]],
      online: [presence('aaa111', 'fioles', 'menu')],
      gameId: 'fioles',
      unlockedOf: () => 3,
      levelOf: () => null,
    });
    expect(position).toMatchObject({ level: 3, live: false });
  });

  it('trouve la page d’un niveau', () => {
    expect([1, 20, 21, 45].map((level) => pageOfLevel(level))).toEqual([0, 0, 1, 2]);
  });
});
