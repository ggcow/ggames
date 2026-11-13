// Grille des niveaux d'un jeu, découpée en pages. Les calculs de pagination sont des fonctions pures.

import type { Presence } from '../../shared/platform/protocol.ts';
import type { LevelProgress, LevelTile } from '../games/client-game.ts';
import { avatar } from './avatar.ts';
import { h } from './dom.ts';
import type { PlatformStrings } from './strings.ts';

export const PAGE_SIZE = 20;

/**
 * Nombre de pages à afficher : jusqu'à la page qui contient le premier niveau encore verrouillé,
 * pour montrer ce qui reste à débloquer, sans dépasser le nombre total de niveaux.
 */
export function pageCount(progress: LevelProgress, pageSize = PAGE_SIZE): number {
  const lastShown = Math.min(progress.total, progress.unlocked + 1);
  return Math.max(1, Math.ceil(lastShown / pageSize));
}

/** Page (0 = première) qui contient le plus haut niveau jouable : celle à ouvrir par défaut. */
export function currentPage(progress: LevelProgress, pageSize = PAGE_SIZE): number {
  return Math.floor((Math.max(1, progress.unlocked) - 1) / pageSize);
}

/** Numéros des niveaux d'une page, bornés au nombre total de niveaux. */
export function pageLevels(page: number, progress: LevelProgress, pageSize = PAGE_SIZE): number[] {
  const first = page * pageSize + 1;
  const last = Math.min(progress.total, first + pageSize - 1);
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => first + i);
}

export interface LevelGridOptions {
  progress: LevelProgress;
  page: number;
  tile: (level: number) => LevelTile;
  /** Joueurs connectés, affichés sur la case du niveau qu'ils jouent. */
  online: readonly Presence[];
  t: PlatformStrings;
  onPage: (page: number) => void;
  onPlay: (key: string) => void;
}

export function renderLevelGrid(options: LevelGridOptions): HTMLElement {
  const { progress, page, t } = options;
  const pages = pageCount(progress);
  const levels = pageLevels(page, progress);
  const first = levels[0] ?? 1;
  const last = levels[levels.length - 1] ?? first;

  const nav = h(
    'div',
    { class: 'pager' },
    h(
      'button',
      {
        class: 'round',
        disabled: page === 0,
        attrs: { 'aria-label': t.previousPage },
        on: { click: () => options.onPage(page - 1) },
      },
      '‹',
    ),
    h('span', { class: 'pager-label' }, t.levelRange(first, last), h('small', null, t.pageOf(page + 1, pages))),
    h(
      'button',
      {
        class: 'round',
        disabled: page >= pages - 1,
        attrs: { 'aria-label': t.nextPage },
        on: { click: () => options.onPage(page + 1) },
      },
      '›',
    ),
  );

  const grid = h(
    'div',
    { class: 'level-grid' },
    ...levels.map((level) => {
      const tile = options.tile(level);
      const here = options.online.filter((p) => p.key === tile.key);
      return h(
        'button',
        {
          class: `level ${tile.status}`,
          disabled: tile.status === 'locked',
          attrs: { 'aria-label': `${tile.label} ${t[`level_${tile.status}`]}` },
          on: { click: () => options.onPlay(tile.key) },
        },
        h('span', { class: 'level-number' }, tile.status === 'locked' ? '🔒' : tile.label),
        tile.status === 'done' ? h('span', { class: 'level-best' }, tile.best ?? '✓') : null,
        tile.status === 'open' ? h('span', { class: 'level-best' }, t.play) : null,
        here.length > 0
          ? h('span', { class: 'level-live' }, ...here.slice(0, 3).map((p) => avatar(p.player, p.name, 'xs')))
          : null,
      );
    }),
  );

  return h('div', { class: 'levels' }, nav, grid);
}
