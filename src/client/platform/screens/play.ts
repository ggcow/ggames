import type { GameState, RecordEntry } from '../../../shared/platform/protocol.ts';
import type { ClientGame, GameView, Unmount } from '../../games/client-game.ts';
import { avatar } from '../avatar.ts';
import { type AppContext, createGameView, type ScreenHandle, wonKeys } from '../context.ts';
import { type Child, h, replaceChildren } from '../dom.ts';
import { chip, errorMessage, loading, screenHeader, showModal, toast } from '../ui.ts';
import { renderLiveBoards } from './online.ts';

/**
 * Cadre d'une partie : en-tête, record, autres joueurs en direct, puis l'écran de jeu fourni par le jeu.
 * Enregistre la partie à la fin, ou comme abandonnée si le joueur quitte en cours de route.
 */
export function mountPlay(host: HTMLElement, ctx: AppContext, game: ClientGame, key: string): ScreenHandle {
  const { t, api } = ctx;
  const gameId = game.definition.id;
  const liveHost = h('div');
  const recordHost = h('div', { class: 'record' });
  const boardHost = h('div', { class: 'play-host' });
  let view: GameView | null = null;
  let unmountGame: Unmount | null = null;
  let started = Date.now();
  let pending: { replay: string; value: number } | null = null;

  const format = game.formatValue;

  const renderRecord = () => {
    const best = view?.state.records[key]?.[0];
    replaceChildren(
      recordHost,
      best && view && format
        ? chip(`🏆 ${t.record(view.playerName(best.player), format(best.value, ctx.lang))}`)
        : null,
    );
  };

  const renderLive = () => {
    const others = ctx.live.presence.filter((p) => p.player !== ctx.me.id && p.game === gameId && p.key === key);
    replaceChildren(
      liveHost,
      others.length > 0
        ? h('small', { class: 'section-title' }, t.raceWith(others.map((p) => p.name).join(', ')))
        : null,
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
          .then(({ run, records }) => showResult(status === 'won', run.value, records))
          .catch((error: unknown) => toast(errorMessage(error, t)));
      },
    });
  };

  /** Classement de la clé, affiché seulement pour un jeu qui a des scores. */
  const leaderboard = (records: RecordEntry[], value: number): Child[] => {
    if (!format) return [];
    const lines: Child[] = records.map((record, index) => {
      const name = view?.playerName(record.player) ?? '?';
      return h(
        'li',
        { class: record.player === ctx.me.id ? 'me' : '' },
        h('span', { class: `rank rank-${index + 1}` }, String(index + 1)),
        avatar(record.player, name, 'xs'),
        h('span', { class: 'grow' }, name),
        h('b', null, format(record.value, ctx.lang)),
      );
    });
    return [
      h('p', { class: 'modal-value' }, format(value, ctx.lang)),
      h('h3', { class: 'section-title' }, t.leaderboard),
      h('ol', { class: 'scores' }, ...lines),
    ];
  };

  /** Niveau suivant, proposé seulement si sa propre progression l'a débloqué après cette victoire. */
  const nextAfterWin = (): string | null => {
    if (!view) return null;
    const next = game.nextKey(key, view);
    const won = wonKeys(view.state, ctx.me.id).add(key);
    return next !== null && game.definition.isUnlocked(next, won) ? next : null;
  };

  const showResult = (won: boolean, value: number, records: RecordEntry[]) => {
    const next = won ? nextAfterWin() : null;
    showModal(
      [
        h('div', { class: 'modal-emoji' }, won ? '🎉' : '😵'),
        h('h2', null, won ? t.won : t.lost),
        ...leaderboard(records, value),
      ],
      [
        ...(next
          ? [{ label: t.next, primary: true, action: () => ctx.navigate({ name: 'play', game: gameId, key: next }) }]
          : []),
        { label: t.back, action: () => ctx.navigate({ name: 'game', game: gameId }) },
      ],
    );
  };

  /** Un ami joue cette clé en ce moment : on peut le rejoindre même si on ne l'a pas encore débloquée. */
  const friendHere = () => ctx.live.presence.some((p) => p.player !== ctx.me.id && p.game === gameId && p.key === key);

  /** Jouable : débloquée par sa progression, déjà gagnée, ou rejointe en direct. */
  const canPlay = (state: GameState) => {
    const won = wonKeys(state, ctx.me.id);
    return game.definition.isUnlocked(key, won) || won.has(key) || friendHere();
  };

  const showLocked = () =>
    replaceChildren(
      host,
      screenHeader(game.keyLabel(key, ctx.lang), () => ctx.navigate({ name: 'game', game: gameId }), t),
      h(
        'div',
        { class: 'empty' },
        h('span', { class: 'empty-icon' }, '🔒'),
        h('h2', null, t.locked),
        h('p', { class: 'muted' }, t.lockedHint),
      ),
    );

  const load = () =>
    api
      .game(gameId)
      .then((state: GameState) => {
        const first = view === null;
        view = createGameView(state, ctx.me.id, ctx.lang);
        renderRecord();
        if (!first) return;
        if (!canPlay(state)) return showLocked();
        replaceChildren(
          host,
          screenHeader(game.keyLabel(key, ctx.lang), () => ctx.navigate({ name: 'game', game: gameId }), t),
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
