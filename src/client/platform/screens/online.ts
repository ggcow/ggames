import type { Presence } from '../../../shared/platform/protocol.ts';
import { findClientGame } from '../../games/registry.ts';
import type { AppContext } from '../context.ts';
import { h } from '../dom.ts';

/** Liste des joueurs connectés avec ce qu'ils font ; un clic rejoint leur partie. */
export function renderOnline(others: readonly Presence[], ctx: AppContext): HTMLElement {
  if (others.length === 0) return h('p', { class: 'muted' }, ctx.t.nobodyOnline);
  return h(
    'div',
    { class: 'stack' },
    ...others.map((presence) => {
      const game = presence.game ? findClientGame(presence.game) : null;
      const activity =
        game && presence.key
          ? `${game.icon} ${game.name[ctx.lang]} · ${game.keyLabel(presence.key, ctx.lang, null)}`
          : ctx.t.inMenus;
      const join =
        game && presence.key
          ? () => ctx.navigate({ name: 'play', game: game.definition.id, key: presence.key ?? '' })
          : undefined;
      return h(
        'button',
        { class: 'card online', disabled: !join, on: join ? { click: join } : {} },
        h('span', { class: 'dot' }),
        h('strong', null, presence.name),
        h('small', { class: 'muted grow' }, activity),
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
        h('small', null, `${presence.name} · ${game.formatValue(presence.value, ctx.lang)}`),
        presence.state ? game.renderLiveState(presence.state) : null,
      ),
    ),
  );
}
