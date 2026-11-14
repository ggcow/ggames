import type { Presence } from '../../../shared/platform/protocol.ts';
import type { LiveStatus } from '../../games/client-game.ts';
import { findClientGame } from '../../games/registry.ts';
import { avatar } from '../avatar.ts';
import type { AppContext } from '../context.ts';
import { h } from '../dom.ts';
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
    ...others.map((presence) => {
      const status = presence.state ? game.liveStatus(presence.state, presence.value) : null;
      return h(
        'div',
        { class: 'live-board' },
        h(
          'div',
          { class: 'live-board-head' },
          avatar(presence.player, presence.name, 'xs'),
          h('strong', null, presence.name),
          game.formatValue ? h('small', null, game.formatValue(presence.value, ctx.lang)) : null,
        ),
        status ? h('span', { class: `live-status ${status}` }, liveStatusLabel(status, ctx.t)) : null,
        presence.state ? game.renderLiveState(presence.state) : null,
      );
    }),
  );
}
