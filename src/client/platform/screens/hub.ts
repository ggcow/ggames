import type { GameSummary, Presence } from '../../../shared/platform/protocol.ts';
import { CLIENT_GAMES } from '../../games/registry.ts';
import type { AppContext, ScreenHandle } from '../context.ts';
import { h, replaceChildren } from '../dom.ts';
import { errorMessage, loading, section, toast } from '../ui.ts';
import { renderOnline } from './online.ts';

/** Accueil : compte, joueurs en ligne, liste des jeux. */
export function mountHub(host: HTMLElement, ctx: AppContext): ScreenHandle {
  const { t, api } = ctx;
  let summaries: GameSummary[] | null = null;
  const onlineHost = h('div');

  const renderPresence = () => {
    const others = ctx.live.presence.filter((p: Presence) => p.player !== ctx.me.id);
    replaceChildren(onlineHost, renderOnline(others, ctx));
  };

  const render = () => {
    if (!summaries) return loading(host, t);
    const account = h(
      'div',
      { class: 'row wrap' },
      h('strong', { class: 'hello' }, t.hello(ctx.me.name)),
      h(
        'button',
        { class: 'ghost small', on: { click: () => ctx.setLang(ctx.lang === 'fr' ? 'zh' : 'fr') } },
        t.switchLang,
      ),
      h('button', { class: 'ghost small', on: { click: rename } }, t.rename),
      h('button', { class: 'ghost small', on: { click: () => void ctx.logout() } }, t.logout),
    );
    const games = summaries.map((summary) => {
      const game = CLIENT_GAMES.get(summary.id);
      if (!game) return null;
      return h(
        'button',
        { class: 'card game-card', on: { click: () => ctx.navigate({ name: 'game', game: summary.id }) } },
        h('span', { class: 'icon' }, game.icon),
        h(
          'span',
          { class: 'grow' },
          h('strong', null, game.name[ctx.lang]),
          h('small', { class: 'muted block' }, game.tagline[ctx.lang]),
          h('small', { class: 'muted block' }, `${t.playersCount(summary.players)} · ${t.runsCount(summary.runs)}`),
        ),
      );
    });
    replaceChildren(
      host,
      h('div', { class: 'hero' }, h('h1', null, t.appName)),
      account,
      section(t.online, onlineHost),
      section(t.games, h('div', { class: 'stack' }, ...games)),
    );
    renderPresence();
  };

  const rename = () => {
    const name = window.prompt(t.newName, ctx.me.name);
    if (!name) return;
    api
      .rename(name)
      .then((me) => {
        ctx.setMe(me);
      })
      .catch((error: unknown) => toast(errorMessage(error, t)));
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
  return { onDataChanged: () => void load(), onPresenceChanged: renderPresence };
}
