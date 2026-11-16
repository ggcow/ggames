import type { GameSummary } from '../../../shared/platform/protocol.ts';
import { CLIENT_GAMES } from '../../games/registry.ts';
import { openAccountDialog } from '../account-dialog.ts';
import { avatar, takenAvatars } from '../avatar.ts';
import { chatScreen } from '../chat-panel.ts';
import type { AppContext, ScreenHandle } from '../context.ts';
import { h, noTranslate, replaceChildren } from '../dom.ts';
import { gameIcon } from '../game-icon.ts';
import { chip, errorMessage, loading, section, toast, withName } from '../ui.ts';
import { renderOnline } from './online.ts';

/** Accueil : compte, liste des jeux, joueurs en ligne. */
export function mountHub(host: HTMLElement, ctx: AppContext): ScreenHandle {
  const { t, api } = ctx;
  let summaries: GameSummary[] | null = null;
  const onlineHost = h('div');
  const screen = chatScreen(ctx, 1);

  const renderPresence = () => {
    replaceChildren(
      onlineHost,
      renderOnline(
        ctx.live.presence.filter((p) => p.player !== ctx.me.id),
        ctx,
      ),
    );
  };

  const editAccount = () =>
    openAccountDialog({ api, t, me: ctx.me, taken: takenAvatars(ctx.me.id), onChanged: (me) => ctx.setMe(me) });

  const account = () =>
    h(
      'header',
      { class: 'account' },
      h(
        'button',
        {
          class: 'avatar-button',
          type: 'button',
          attrs: { 'aria-label': t.changeAvatar },
          on: { click: editAccount },
        },
        avatar(ctx.me.id, ctx.me.name, 'md'),
      ),
      h(
        'div',
        { class: 'account-text' },
        h('small', null, t.welcome),
        noTranslate(h('strong', null, ctx.me.name)),
        h('small', null, ...withName(t.loginIs, ctx.me.login)),
      ),
      h('button', { class: 'btn small', on: { click: editAccount } }, t.editAccount),
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
      h('span', { class: 'game-icon' }, gameIcon(game.icon)),
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
    screen.show(host);
    replaceChildren(
      screen.content,
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
    dispose: screen.dispose,
  };
}
