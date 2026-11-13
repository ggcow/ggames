import { describe, expect, it, vi } from 'vitest';
import type { LevelTile } from '../../src/client/games/client-game.ts';
import { avatar, avatarColor, initial } from '../../src/client/platform/avatar.ts';
import { currentPage, pageCount, pageLevels, renderLevelGrid } from '../../src/client/platform/level-grid.ts';
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
  const friend: Presence = { player: 'abc123', name: 'léa', game: 'fioles', key: 'c:2', state: null, value: 3 };

  const render = (page = 0, onPage = vi.fn(), onPlay = vi.fn()) =>
    renderLevelGrid({
      progress: { unlocked: 3, total: 9999 },
      page,
      tile,
      online: [friend],
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

  it('montre les amis connectés sur le niveau qu’ils jouent', () => {
    const cells = render().querySelectorAll('.level');
    expect(cells[1]?.querySelector('.avatar')?.textContent).toBe('L');
    expect(cells[0]?.querySelector('.avatar')).toBeNull();
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
      online: [],
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
