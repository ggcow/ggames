import type { GameSummary } from '../../../shared/platform/protocol.ts';
import { CLIENT_GAMES } from '../../games/registry.ts';
import { avatar } from '../avatar.ts';
import { chatButton } from '../chat-button.ts';
import type { AppContext, ScreenHandle } from '../context.ts';
import { h, replaceChildren } from '../dom.ts';
import { chip, errorMessage, loading, section, toast } from '../ui.ts';
import { renderOnline } from './online.ts';

/** Accueil : compte, liste des jeux, joueurs en ligne. */
export function mountHub(host: HTMLElement, ctx: AppContext): ScreenHandle {
  const { t, api } = ctx;
  let summaries: GameSummary[] | null = null;
  const onlineHost = h('div');
  const chat = chatButton(ctx);

  const renderPresence = () => {
    replaceChildren(
      onlineHost,
      renderOnline(
        ctx.live.presence.filter((p) => p.player !== ctx.me.id),
        ctx,
      ),
    );
  };

  const rename = () => {
    const name = window.prompt(t.newName, ctx.me.name);
    if (!name) return;
    api
      .rename(name)
      .then((me) => ctx.setMe(me))
      .catch((error: unknown) => toast(errorMessage(error, t)));
  };

  const account = () =>
    h(
      'header',
      { class: 'account' },
      avatar(ctx.me.id, ctx.me.name, 'md'),
      h('div', { class: 'account-text' }, h('small', null, t.welcome), h('strong', null, ctx.me.name)),
      chat.element,
      h('button', { class: 'round small', attrs: { 'aria-label': t.rename }, on: { click: rename } }, '✎'),
      h(
        'button',
        {
          class: 'round small',
          attrs: { 'aria-label': t.switchLang },
          on: { click: () => ctx.setLang(ctx.lang === 'fr' ? 'zh' : 'fr') },
        },
        t.langShort,
      ),
      h(
        'button',
        { class: 'round small', attrs: { 'aria-label': t.logout }, on: { click: () => void ctx.logout() } },
        '⏻',
      ),
    );

  const gameCard = (summary: GameSummary) => {
    const game = CLIENT_GAMES.get(summary.id);
    if (!game) return null;
    return h(
      'button',
      {
        class: `game-card theme-${summary.id}`,
        on: { click: () => ctx.navigate({ name: 'game', game: summary.id }) },
      },
      h('span', { class: 'game-icon' }, game.icon),
      h(
        'span',
        { class: 'game-text' },
        h('strong', null, game.name[ctx.lang]),
        h('small', null, game.tagline[ctx.lang]),
        h(
          'span',
          { class: 'chips' },
          chip(`👥 ${t.playersCount(summary.players)}`),
          chip(`🎯 ${t.runsCount(summary.runs)}`),
        ),
      ),
      h('span', { class: 'game-go' }, '›'),
    );
  };

  const render = () => {
    if (!summaries) return loading(host, t);
    replaceChildren(
      host,
      account(),
      h('div', { class: 'brand' }, h('h1', null, t.appName), h('p', null, t.tagline)),
      section(t.games, h('div', { class: 'stack' }, ...summaries.map(gameCard))),
      section(t.online, onlineHost),
    );
    renderPresence();
  };

  const load = () =>
    api
      .games()
      .then((list) => {
        summaries = list;
        render();
      })
      .catch((error: unknown) => toast(errorMessage(error, t)));

  render();
  void load();
  return {
    onDataChanged: () => void load(),
    onPresenceChanged: renderPresence,
    dispose: chat.dispose,
  };
}
