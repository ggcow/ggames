// Grille des niveaux d'un jeu, découpée en pages, avec la position de chaque joueur.
// Les calculs (pagination, positions) sont des fonctions pures.

import type { PlayerId, PlayerInfo, Presence } from '../../shared/platform/protocol.ts';
import type { LevelProgress, LevelTile } from '../games/client-game.ts';
import { avatar, avatarGroup } from './avatar.ts';
import { canJoinRace } from './context.ts';
import { h, noTranslate } from './dom.ts';
import type { PlatformStrings } from './strings.ts';

export const PAGE_SIZE = 20;

/** Avatars des joueurs posés sur une case, au plus ; au-delà, un compteur « +n ». */
const MAX_MARKERS = 3;

/** Avatars des détenteurs du record sous le numéro d'une case, au plus : la case est étroite. */
const MAX_HOLDERS = 2;

/**
 * Nombre de pages à afficher : jusqu'à la page qui contient le premier niveau encore verrouillé,
 * pour montrer ce qui reste à débloquer, sans dépasser le nombre total de niveaux.
 */
export function pageCount(progress: LevelProgress, pageSize = PAGE_SIZE): number {
  const lastShown = Math.min(progress.total, progress.unlocked + 1);
  return Math.max(1, Math.ceil(lastShown / pageSize));
}

/** Page (0 = première) qui contient le niveau `level`. */
export const pageOfLevel = (level: number, pageSize = PAGE_SIZE): number =>
  Math.floor((Math.max(1, level) - 1) / pageSize);

/** Page qui contient le plus haut niveau jouable : celle à ouvrir par défaut. */
export const currentPage = (progress: LevelProgress, pageSize = PAGE_SIZE): number =>
  pageOfLevel(progress.unlocked, pageSize);

/** Numéros des niveaux d'une page, bornés au nombre total de niveaux. */
export function pageLevels(page: number, progress: LevelProgress, pageSize = PAGE_SIZE): number[] {
  const first = page * pageSize + 1;
  const last = Math.min(progress.total, first + pageSize - 1);
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => first + i);
}

/** Où se trouve un joueur dans les niveaux. */
export interface PlayerPosition {
  player: PlayerId;
  name: string;
  level: number;
  /** En train de jouer ce niveau en ce moment. */
  live: boolean;
  /** Le joueur qui regarde la grille. */
  me: boolean;
}

export interface PositionsInput {
  players: readonly PlayerInfo[];
  online: readonly Presence[];
  gameId: string;
  /** Joueur qui regarde la grille. */
  me: PlayerId;
  /** Plus haut niveau jouable d'un joueur. */
  unlockedOf: (player: PlayerId) => number;
  /** Le joueur a déjà joué au moins une partie de ce jeu. */
  played: (player: PlayerId) => boolean;
  /** Niveau désigné par une clé, ou null. */
  levelOf: (key: string) => number | null;
}

/**
 * Position de chaque joueur : le niveau qu'il joue s'il est en ligne dans ce jeu, sinon le plus haut niveau
 * qu'il a débloqué. Un joueur qui n'a jamais joué à ce jeu et n'y joue pas en direct n'a pas de position : il
 * encombrerait le premier niveau. Triées du plus avancé au moins avancé.
 */
export function playerPositions(input: PositionsInput): PlayerPosition[] {
  return input.players
    .flatMap((player) => {
      const presence = input.online.find((p) => p.player === player.id && p.game === input.gameId && p.key);
      const liveLevel = presence?.key ? input.levelOf(presence.key) : null;
      if (liveLevel === null && !input.played(player.id)) return [];
      return [
        {
          player: player.id,
          name: player.name,
          level: liveLevel ?? input.unlockedOf(player.id),
          live: liveLevel !== null,
          me: player.id === input.me,
        },
      ];
    })
    .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
}

export interface LevelGridOptions {
  progress: LevelProgress;
  page: number;
  tile: (level: number) => LevelTile;
  positions: readonly PlayerPosition[];
  /** Joueurs au plus dans une course du jeu (`ClientGame.raceSize`). */
  raceSize: number;
  t: PlatformStrings;
  onPage: (page: number) => void;
  onPlay: (key: string) => void;
}

const marker = (position: PlayerPosition, t: PlatformStrings): HTMLElement => {
  const element = avatar(position.player, position.name, 'xs');
  if (position.live) element.classList.add('live');
  if (position.me) element.classList.add('me');
  const status = position.live ? t.inGame : t.levelShort(position.level);
  element.title = `${position.name} — ${status}`;
  element.setAttribute('aria-label', `${position.name} — ${status}`);
  return element;
};

function renderPager(options: LevelGridOptions, first: number, last: number): HTMLElement {
  const { page, t } = options;
  // Assez de pages pour atteindre le niveau du joueur le plus avancé.
  const pages = Math.max(pageCount(options.progress), ...options.positions.map((p) => pageOfLevel(p.level) + 1));
  return h(
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
}

/** Ce que dit la case d'un niveau réussi : son score parfait, sinon les détenteurs du record. */
function recordText(tile: LevelTile, t: PlatformStrings): string | null {
  if (tile.status !== 'done') return null;
  if (tile.perfect) return t.perfectScore;
  if (tile.holders.length === 0) return null;
  const record = t.recordNames(tile.holders.map((holder) => holder.name).join(', '));
  return tile.recordPerfect ? `${record}, ${t.perfectScore}` : record;
}

/**
 * Sous le numéro d'un niveau réussi : un 💎 si le joueur a le score parfait ; sinon les avatars des détenteurs du
 * record, ex æquo compris, marqués d'un petit 💎 si ce record est parfait.
 */
function renderRecord(tile: LevelTile, label: string | null): HTMLElement | null {
  if (label === null) return null;
  if (tile.perfect) return h('span', { class: 'level-perfect', attrs: { 'aria-hidden': 'true' } }, '💎');
  return h(
    'span',
    { class: `level-holders${tile.recordPerfect ? ' perfect' : ''}`, attrs: { title: label } },
    ...avatarGroup(tile.holders, MAX_HOLDERS, (holder) => avatar(holder.player, holder.name, 'xs')),
  );
}

function renderTile(options: LevelGridOptions, level: number): HTMLElement {
  const { t } = options;
  const tile = options.tile(level);
  const here = options.positions.filter((p) => p.level === level);
  // Un niveau verrouillé qu'un ami joue en ce moment peut être rejoint, tant que la course n'est pas complète.
  const joinable = canJoinRace(here.filter((p) => p.live).length, options.raceSize);
  const state = tile.status === 'locked' && joinable ? 'join' : tile.status;
  const players = here.map((p) => `${p.name}${p.live ? ` (${t.inGame})` : ''}`).join(', ');
  const record = recordText(tile, t);
  const label = [`${tile.label} ${t[`level_${state}`]}`, record].filter(Boolean).join(', ');
  return h(
    'button',
    {
      class: `level ${state}${tile.status === 'done' && tile.perfect ? ' perfect' : ''}`,
      disabled: state === 'locked',
      attrs: { 'aria-label': `${label}${players ? ` — ${players}` : ''}` },
      on: { click: () => options.onPlay(tile.key) },
    },
    noTranslate(h('span', { class: 'level-number' }, state === 'locked' ? '🔒' : tile.label)),
    state === 'join' ? h('span', { class: 'level-hint' }, t.join) : null,
    state === 'open' ? h('span', { class: 'level-hint' }, t.play) : null,
    renderRecord(tile, record),
    here.length > 0
      ? h('span', { class: 'level-live' }, ...avatarGroup(here, MAX_MARKERS, (position) => marker(position, t)))
      : null,
  );
}

export function renderLevelGrid(options: LevelGridOptions): HTMLElement {
  const levels = pageLevels(options.page, options.progress);
  const first = levels[0] ?? 1;
  const last = levels[levels.length - 1] ?? first;
  return h(
    'div',
    { class: 'levels' },
    renderPager(options, first, last),
    h('div', { class: 'level-grid' }, ...levels.map((level) => renderTile(options, level))),
  );
}
