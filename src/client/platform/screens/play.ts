import type { GameState, RecordEntry } from '../../../shared/platform/protocol.ts';
import type { ClientGame, GameView, Unmount } from '../../games/client-game.ts';
import { type AppContext, createGameView, type ScreenHandle } from '../context.ts';
import { type Child, h, replaceChildren } from '../dom.ts';
import { errorMessage, loading, screenHeader, showModal, toast } from '../ui.ts';
import { renderLiveBoards } from './online.ts';

/**
 * Cadre d'une partie : en-tête, record, autres joueurs en direct, puis l'écran de jeu fourni par le jeu.
 * Enregistre la partie à la fin, ou comme abandonnée si le joueur quitte en cours de route.
 */
export function mountPlay(host: HTMLElement, ctx: AppContext, game: ClientGame, key: string): ScreenHandle {
  const { t, api } = ctx;
  const gameId = game.definition.id;
  const liveHost = h('div');
  const recordHost = h('p', { class: 'muted center small' });
  const boardHost = h('div', { class: 'play-host' });
  let view: GameView | null = null;
  let unmountGame: Unmount | null = null;
  let started = Date.now();
  let pending: { replay: string; value: number } | null = null;

  const renderRecord = () => {
    const best = view?.state.records[key]?.[0];
    recordHost.textContent =
      best && view ? t.record(view.playerName(best.player), game.formatValue(best.value, ctx.lang)) : '';
  };

  const renderLive = () => {
    const others = ctx.live.presence.filter((p) => p.player !== ctx.me.id && p.game === gameId && p.key === key);
    replaceChildren(
      liveHost,
      others.length > 0 ? h('small', { class: 'muted' }, t.alsoHere) : null,
      renderLiveBoards(others, ctx, gameId),
    );
  };

  const submitAbandon = () => {
    if (!pending || pending.value === 0) return;
    const replay = pending.replay;
    pending = null;
    void api
      .submitRun(gameId, { key, status: 'abandoned', durationMs: Date.now() - started, replay })
      .catch(() => undefined);
  };

  const start = () => {
    unmountGame?.();
    started = Date.now();
    pending = null;
    unmountGame = game.mountPlay(boardHost, {
      key,
      lang: ctx.lang,
      progress: ({ state, value, replay }) => {
        pending = { replay, value };
        ctx.live.setActivity({ type: 'activity', game: gameId, key, state, value });
      },
      finish: ({ status, replay }) => {
        pending = null;
        api
          .submitRun(gameId, { key, status, durationMs: Date.now() - started, replay })
          .then(({ run, records }) => showResult(status === 'won', game.formatValue(run.value, ctx.lang), records))
          .catch((error: unknown) => toast(errorMessage(error, t)));
      },
    });
  };

  const showResult = (won: boolean, value: string, records: RecordEntry[]) => {
    const next = view ? game.nextKey(key, view) : null;
    const lines: Child[] = records.map((record, index) =>
      h(
        'li',
        { class: record.player === ctx.me.id ? 'me' : '' },
        h('span', null, `${index + 1}. ${view?.playerName(record.player) ?? '?'}`),
        h('b', null, game.formatValue(record.value, ctx.lang)),
      ),
    );
    showModal(
      [
        h('h2', null, won ? t.won : t.lost),
        h('p', null, value),
        h('h3', null, t.leaderboard),
        h('ol', { class: 'scores' }, ...lines),
      ],
      [
        ...(next
          ? [{ label: t.next, primary: true, action: () => ctx.navigate({ name: 'play', game: gameId, key: next }) }]
          : []),
        { label: t.retry, action: start },
        { label: t.back, action: () => ctx.navigate({ name: 'game', game: gameId }) },
      ],
    );
  };

  const load = () =>
    api
      .game(gameId)
      .then((state: GameState) => {
        const first = view === null;
        view = createGameView(state, ctx.me.id, ctx.lang);
        renderRecord();
        if (!first) return;
        replaceChildren(
          host,
          screenHeader(game.keyLabel(key, ctx.lang), () => ctx.navigate({ name: 'game', game: gameId })),
          recordHost,
          liveHost,
          boardHost,
        );
        renderLive();
        start();
      })
      .catch((error: unknown) => toast(errorMessage(error, t)));

  loading(host, t);
  void load();
  return {
    onDataChanged: () => void load(),
    onPresenceChanged: renderLive,
    dispose: () => {
      submitAbandon();
      unmountGame?.();
      ctx.live.setActivity({ type: 'idle' });
    },
  };
}
