import type { GameSummary } from '../../../shared/platform/protocol.ts';
import { CLIENT_GAMES } from '../../games/registry.ts';
import { openAccountDialog } from '../account-dialog.ts';
import { avatar, takenAvatars } from '../avatar.ts';
import { chatScreen } from '../chat-panel.ts';
import type { AppContext, ScreenHandle } from '../context.ts';
import { h, noTranslate, replaceChildren } from '../dom.ts';
import { gameIcon } from '../game-icon.ts';
import type { InstallMode } from '../install.ts';
import { chip, errorMessage, loading, section, showModal, toast, withName } from '../ui.ts';
import { renderOnline } from './online.ts';

/** Accueil : compte, installation de l'appli, liste des jeux, joueurs en ligne. */
export function mountHub(host: HTMLElement, ctx: AppContext): ScreenHandle {
  const { t, api } = ctx;
  let summaries: GameSummary[] | null = null;
  const onlineHost = h('div');
  const installHost = h('div', { class: 'install-host' });
  const screen = chatScreen(ctx, 'single');

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
        h('span', { class: 'power' }),
      ),
    );

  const installHelp: Record<Exclude<InstallMode, 'installed' | 'prompt'>, string> = {
    ios: t.installIos,
    wechat: t.installWechat,
    menu: t.installMenu,
  };

  const install = () => {
    const mode = ctx.installer.mode();
    if (mode === 'installed') return;
    if (mode === 'prompt') {
      void ctx.installer.prompt();
      return;
    }
    showModal([h('h3', null, t.installApp), h('p', null, installHelp[mode])], [{ label: t.close, primary: true }]);
  };

  const renderInstall = () => {
    replaceChildren(
      installHost,
      ctx.installer.mode() === 'installed'
        ? null
        : h(
            'button',
            { class: 'install-card', type: 'button', on: { click: install } },
            h('span', { class: 'install-icon' }, h('img', { attrs: { src: '/icons/icon-192.png', alt: '' } })),
            h('span', { class: 'install-text' }, h('strong', null, t.installApp), h('small', null, t.installHint)),
            h('span', { class: 'game-go' }, '›'),
          ),
    );
  };

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
      installHost,
      section(t.games, h('div', { class: 'stack' }, ...summaries.map(gameCard))),
      section(t.online, onlineHost),
    );
    renderInstall();
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
  const stopInstall = ctx.installer.subscribe(renderInstall);
  return {
    onDataChanged: () => void load(),
    onPresenceChanged: renderPresence,
    dispose: () => {
      stopInstall();
      screen.dispose();
    },
  };
}
