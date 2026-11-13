import type { GameState } from '../../../shared/platform/protocol.ts';
import type { ClientGame } from '../../games/client-game.ts';
import { type AppContext, createGameView, type ScreenHandle } from '../context.ts';
import { h, replaceChildren } from '../dom.ts';
import { formatDate, formatDuration } from '../i18n.ts';
import { currentPage, renderLevelGrid } from '../level-grid.ts';
import { errorMessage, loading, screenHeader, section, toast } from '../ui.ts';
import { renderOnline } from './online.ts';

/** Page d'un jeu : grille des niveaux, joueurs en ligne, progression de chaque joueur. */
export function mountGame(host: HTMLElement, ctx: AppContext, game: ClientGame): ScreenHandle {
  const { t, api } = ctx;
  const gameId = game.definition.id;
  let state: GameState | null = null;
  let page: number | null = null;
  const onlineHost = h('div');
  const gridHost = h('div');

  const others = () => ctx.live.presence.filter((p) => p.player !== ctx.me.id && p.game === gameId);

  const renderGrid = () => {
    if (!state) return;
    const view = createGameView(state, ctx.me.id, ctx.lang);
    const progress = game.levelProgress(view);
    page ??= currentPage(progress);
    replaceChildren(
      gridHost,
      renderLevelGrid({
        progress,
        page,
        tile: (level) => game.levelTile(level, view),
        online: others(),
        t,
        onPage: (next) => {
          page = next;
          renderGrid();
        },
        onPlay: (key) => ctx.navigate({ name: 'play', game: gameId, key }),
      }),
    );
  };

  const renderPresence = () => {
    replaceChildren(onlineHost, renderOnline(others(), ctx));
    renderGrid();
  };

  const render = () => {
    if (!state) return loading(host, t);
    replaceChildren(
      host,
      screenHeader(`${game.icon} ${game.name[ctx.lang]}`, () => ctx.navigate({ name: 'hub' })),
      section(t.levels, gridHost),
      section(t.online, onlineHost),
      section(t.players, renderProgress(state)),
    );
    renderPresence();
  };

  const renderProgress = (current: GameState) => {
    if (current.progress.length === 0) return h('p', { class: 'muted' }, t.noRuns);
    const names = new Map(current.players.map((p) => [p.id, p.name]));
    return h(
      'div',
      { class: 'stack' },
      ...current.progress.map((progress) =>
        h(
          'button',
          {
            class: `card progress ${progress.player === ctx.me.id ? 'me' : ''}`,
            on: { click: () => ctx.navigate({ name: 'player', game: gameId, player: progress.player }) },
          },
          h('strong', { class: 'grow' }, names.get(progress.player) ?? '?'),
          h(
            'small',
            { class: 'muted' },
            `${t.completed} ${progress.completed} · ${t.runsCount(progress.runs)} · ${formatDuration(progress.playTimeMs, ctx.lang)}`,
          ),
          h('small', { class: 'muted block' }, `${t.lastPlayed} : ${formatDate(progress.lastPlayed, ctx.lang)}`),
        ),
      ),
    );
  };

  const load = () =>
    api
      .game(gameId)
      .then((loaded) => {
        state = loaded;
        render();
      })
      .catch((error: unknown) => toast(errorMessage(error, t)));

  render();
  void load();
  return { onDataChanged: () => void load(), onPresenceChanged: renderPresence };
}
