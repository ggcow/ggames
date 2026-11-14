import type { GameState, PlayerProgress } from '../../../shared/platform/protocol.ts';
import type { ClientGame } from '../../games/client-game.ts';
import { avatar } from '../avatar.ts';
import { chatPanel } from '../chat-panel.ts';
import { type AppContext, createGameView, type ScreenHandle } from '../context.ts';
import { h, replaceChildren } from '../dom.ts';
import { formatDuration } from '../i18n.ts';
import { currentPage, playerPositions, renderLevelGrid } from '../level-grid.ts';
import { errorMessage, loading, screenHeader, section, toast } from '../ui.ts';
import { renderOnline } from './online.ts';

/** Page d'un jeu : grille des niveaux, joueurs en ligne, classement des joueurs. */
export function mountGame(host: HTMLElement, ctx: AppContext, game: ClientGame): ScreenHandle {
  const { t, api } = ctx;
  const gameId = game.definition.id;
  let state: GameState | null = null;
  let page: number | null = null;
  const onlineHost = h('div');
  const gridHost = h('div');
  const contentHost = h('div');
  const chat = chatPanel(ctx);
  const chatSection = section(t.chat, chat.element);
  let mounted = false;

  const others = () => ctx.live.presence.filter((p) => p.player !== ctx.me.id && p.game === gameId);

  const renderGrid = () => {
    if (!state) return;
    const view = createGameView(state, ctx.me.id, ctx.lang);
    const progress = game.levelProgress(view, ctx.me.id);
    page ??= currentPage(progress);
    replaceChildren(
      gridHost,
      renderLevelGrid({
        progress,
        page,
        tile: (level) => game.levelTile(level, view),
        positions: playerPositions({
          players: state.players,
          online: ctx.live.presence,
          gameId,
          unlockedOf: (player) => game.levelProgress(view, player).unlocked,
          levelOf: (key) => game.levelOf(key),
        }),
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

  const hero = (current: GameState) => {
    const mine = current.progress.find((p) => p.player === ctx.me.id);
    return h(
      'div',
      { class: `game-hero theme-${gameId}` },
      h('span', { class: 'game-icon' }, game.icon),
      h(
        'div',
        { class: 'game-text' },
        h('strong', null, game.name[ctx.lang]),
        h('small', null, mine ? t.levelsDone(mine.completed) : game.tagline[ctx.lang]),
      ),
    );
  };

  const playerRow = (progress: PlayerProgress, rank: number, names: Map<string, string>) =>
    h(
      'button',
      {
        class: `rank-row ${progress.player === ctx.me.id ? 'me' : ''}`,
        on: { click: () => ctx.navigate({ name: 'player', game: gameId, player: progress.player }) },
      },
      h('span', { class: `rank rank-${rank}` }, String(rank)),
      avatar(progress.player, names.get(progress.player) ?? '?', 'sm'),
      h(
        'span',
        { class: 'rank-text' },
        h('strong', null, names.get(progress.player) ?? '?'),
        h('small', null, `${t.runsCount(progress.runs)} · ${formatDuration(progress.playTimeMs, ctx.lang)}`),
      ),
      h(
        'span',
        { class: 'rank-score' },
        h('strong', null, String(progress.completed)),
        h('small', null, t.levelsShort),
      ),
    );

  const renderPlayers = (current: GameState) => {
    if (current.progress.length === 0) return h('p', { class: 'muted empty-line' }, t.noRuns);
    const names = new Map(current.players.map((p) => [p.id, p.name]));
    return h('div', { class: 'rank-list' }, ...current.progress.map((p, i) => playerRow(p, i + 1, names)));
  };

  const render = () => {
    if (!state) return loading(host, t);
    if (!mounted) {
      replaceChildren(host, contentHost, chatSection);
      mounted = true;
    }
    replaceChildren(
      contentHost,
      screenHeader('', () => ctx.navigate({ name: 'hub' }), t),
      hero(state),
      section(t.levels, gridHost),
      section(t.online, onlineHost),
      section(t.players, renderPlayers(state)),
    );
    renderPresence();
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
  return {
    onDataChanged: () => void load(),
    onPresenceChanged: renderPresence,
    dispose: chat.dispose,
  };
}
