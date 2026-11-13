import type { Presence } from '../../../shared/platform/protocol.ts';
import { findClientGame } from '../../games/registry.ts';
import { avatar } from '../avatar.ts';
import type { AppContext } from '../context.ts';
import { h } from '../dom.ts';

/** Joueurs connectés avec ce qu'ils font ; toucher un joueur en partie rejoint son niveau. */
export function renderOnline(others: readonly Presence[], ctx: AppContext): HTMLElement {
  if (others.length === 0) return h('p', { class: 'muted empty-line' }, ctx.t.nobodyOnline);
  return h(
    'div',
    { class: 'online-list' },
    ...others.map((presence) => {
      const game = presence.game ? findClientGame(presence.game) : null;
      const key = presence.key;
      const activity = game && key ? `${game.icon} ${game.keyLabel(key, ctx.lang)}` : ctx.t.inMenus;
      const join = game && key ? () => ctx.navigate({ name: 'play', game: game.definition.id, key }) : undefined;
      return h(
        'button',
        { class: 'online-chip', disabled: !join, on: join ? { click: join } : {} },
        h(
          'span',
          { class: 'online-avatar' },
          avatar(presence.player, presence.name, 'md'),
          h('span', { class: 'dot' }),
        ),
        h('span', { class: 'online-text' }, h('strong', null, presence.name), h('small', null, activity)),
      );
    }),
  );
}

/** Aperçus en direct des autres joueurs sur la même clé. */
export function renderLiveBoards(others: readonly Presence[], ctx: AppContext, gameId: string): HTMLElement | null {
  const game = findClientGame(gameId);
  if (!game || others.length === 0) return null;
  return h(
    'div',
    { class: 'live-boards' },
    ...others.map((presence) =>
      h(
        'div',
        { class: 'live-board' },
        h(
          'div',
          { class: 'live-board-head' },
          avatar(presence.player, presence.name, 'xs'),
          h('strong', null, presence.name),
          h('small', null, game.formatValue(presence.value, ctx.lang)),
        ),
        presence.state ? game.renderLiveState(presence.state) : null,
      ),
    ),
  );
}
