import type { Presence } from '../../../shared/platform/protocol.ts';
import type { LiveStatus } from '../../games/client-game.ts';
import { findClientGame } from '../../games/registry.ts';
import { avatar } from '../avatar.ts';
import type { AppContext } from '../context.ts';
import { h, noTranslate } from '../dom.ts';
import { gameIcon } from '../game-icon.ts';
import type { PlatformStrings } from '../strings.ts';

/** Libellé de l'indicateur d'avancement, dans la langue de l'interface. */
const liveStatusLabel = (status: LiveStatus, t: PlatformStrings): string => {
  switch (status) {
    case 'start':
      return t.live_start;
    case 'far':
      return t.live_far;
    case 'close':
      return t.live_close;
    case 'stuck':
      return t.live_stuck;
  }
};

/**
 * Joueurs connectés avec ce qu'ils font. Un joueur en partie se rejoint d'un toucher : sa pastille s'entoure d'une
 * aura qui pulse et porte « Rejoindre », pour qu'on la distingue d'un joueur dans les menus.
 */
export function renderOnline(others: readonly Presence[], ctx: AppContext): HTMLElement {
  if (others.length === 0) return h('p', { class: 'muted empty-line' }, ctx.t.nobodyOnline);
  return h(
    'div',
    { class: 'online-list' },
    ...others.map((presence) => {
      const game = presence.game ? findClientGame(presence.game) : null;
      const key = presence.key;
      const activity = game && key ? [gameIcon(game.icon), ` ${game.keyLabel(key, ctx.lang)}`] : [ctx.t.inMenus];
      const join = game && key ? () => ctx.navigate({ name: 'play', game: game.definition.id, key }) : undefined;
      return h(
        'button',
        { class: join ? 'online-chip joinable' : 'online-chip', disabled: !join, on: join ? { click: join } : {} },
        h(
          'span',
          { class: 'online-avatar' },
          avatar(presence.player, presence.name, 'md'),
          h('span', { class: 'dot' }),
        ),
        h(
          'span',
          { class: 'online-text' },
          noTranslate(h('strong', null, presence.name)),
          h('small', null, ...activity),
        ),
        join ? h('span', { class: 'online-join' }, ctx.t.join) : null,
      );
    }),
  );
}

/** Aperçus côte à côte à partir desquels les cartes se resserrent pour tenir sur un téléphone. */
const COMPACT_COLUMNS = 3;

/**
 * Aperçus en direct des autres joueurs sur la même clé, côte à côte : une colonne par place de la course, pour que
 * leur taille ne change pas quand un joueur arrive ou repart. À trois colonnes et plus, les cartes se resserrent.
 */
export function renderLiveBoards(others: readonly Presence[], ctx: AppContext, gameId: string): HTMLElement | null {
  const game = findClientGame(gameId);
  if (!game || others.length === 0) return null;
  const columns = game.raceSize - 1;
  return h(
    'div',
    {
      class: columns >= COMPACT_COLUMNS ? 'live-boards compact' : 'live-boards',
      style: { '--previews': String(columns) },
    },
    ...others.slice(0, columns).map((presence) => {
      const status = presence.state ? game.liveStatus(presence.state, presence.value) : null;
      const tag = presence.state ? game.liveTag(presence.state, presence.value, ctx.lang) : null;
      return h(
        'div',
        { class: 'live-board' },
        h(
          'div',
          { class: 'live-board-head' },
          avatar(presence.player, presence.name, 'xs'),
          noTranslate(h('strong', null, presence.name)),
          tag === null ? null : noTranslate(h('small', null, tag)),
        ),
        status ? h('span', { class: `live-status ${status}` }, liveStatusLabel(status, ctx.t)) : null,
        presence.state ? game.renderLiveState(presence.state) : null,
      );
    }),
  );
}
