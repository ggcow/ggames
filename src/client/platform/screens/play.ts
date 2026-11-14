import type { GameState, ReactionNotice, RecordEntry } from '../../../shared/platform/protocol.ts';
import { findReaction, REACTIONS } from '../../../shared/platform/reactions.ts';
import type { ClientGame, GameView, Unmount } from '../../games/client-game.ts';
import { avatar } from '../avatar.ts';
import {
  type AppContext,
  canJoinRace,
  createGameView,
  RACE_SIZE,
  rivalsOn,
  type ScreenHandle,
  wonKeys,
} from '../context.ts';
import { type Child, h, replaceChildren } from '../dom.ts';
import type { Lang } from '../i18n.ts';
import { reactionLabel } from '../reactions.ts';
import type { PlatformStrings } from '../strings.ts';
import { errorMessage, loading, screenHeader, showModal, toast } from '../ui.ts';
import { renderLiveBoards } from './online.ts';

/** Record de la clé en badge compact pour l'en-tête : avatar du détenteur et score, phrase complète en titre. */
export function recordBadge(
  view: GameView,
  key: string,
  format: ((value: number, lang: Lang) => string) | null,
  t: PlatformStrings,
): HTMLElement | null {
  const best = view.state.records[key]?.[0];
  if (!best || !format) return null;
  const name = view.playerName(best.player);
  const value = format(best.value, view.lang);
  const text = t.record(name, value);
  return h(
    'span',
    { class: 'chip record-badge', attrs: { title: text, 'aria-label': text } },
    '🏆',
    avatar(best.player, name, 'xs'),
    value,
  );
}

/**
 * Cadre d'une partie, pensé pour un téléphone : en-tête avec le record, aperçus en petit d'au plus deux
 * adversaires en direct, puis son propre plateau en grand, fourni par le jeu.
 * Enregistre la partie à la fin, ou comme abandonnée si le joueur quitte en cours de route.
 */
export function mountPlay(host: HTMLElement, ctx: AppContext, game: ClientGame, key: string): ScreenHandle {
  const { t, api } = ctx;
  const gameId = game.definition.id;
  const liveHost = h('div');
  const recordHost = h('div', { class: 'record' });
  const boardHost = h('div', { class: 'play-host' });
  const reactionHost = h('div', { class: 'reaction-bubbles', attrs: { 'aria-live': 'polite' } });
  const reactionTimers = new Set<ReturnType<typeof setTimeout>>();
  let closeReactions: (() => void) | null = null;
  let view: GameView | null = null;
  let unmountGame: Unmount | null = null;
  let started = Date.now();
  let pending: { replay: string; value: number } | null = null;

  const format = game.formatValue;
  const rivals = () => rivalsOn(ctx.live.presence, ctx.me.id, gameId, key);

  const openReactions = () => {
    closeReactions?.();
    const close = showModal(
      [
        h('h3', { class: 'section-title' }, t.reactions),
        h(
          'div',
          { class: 'reaction-grid' },
          ...REACTIONS.map((reaction) =>
            h(
              'button',
              {
                class: `reaction-option ${reaction.kind}`,
                attrs: {
                  'aria-label': reaction.kind === 'emoji' ? reaction.emoji : reactionLabel(reaction.code, ctx.lang),
                },
                on: {
                  click: () => {
                    closeReactions?.();
                    ctx.live.react(gameId, key, reaction.code);
                  },
                },
              },
              reaction.kind === 'emoji' ? reaction.emoji : reactionLabel(reaction.code, ctx.lang),
            ),
          ),
        ),
      ],
      [{ label: t.close }],
    );
    closeReactions = () => {
      closeReactions = null;
      close();
    };
  };

  const reactionButton = h(
    'button',
    {
      class: 'round small reaction-button',
      attrs: { 'aria-label': t.reactions },
      on: { click: openReactions },
    },
    '😀',
  );
  reactionButton.hidden = true;

  const showReaction = (notice: ReactionNotice) => {
    if (notice.game !== gameId || notice.key !== key) return;
    const reaction = findReaction(notice.code);
    if (!reaction) return;
    const label = reactionLabel(notice.code, ctx.lang);
    const bubble = h(
      'div',
      {
        class: `reaction-bubble ${notice.player === ctx.me.id ? 'me' : ''}`,
        attrs: { 'aria-label': `${notice.name} : ${label}` },
      },
      avatar(notice.player, notice.name, 'xs'),
      h('span', { class: reaction.kind === 'emoji' ? 'reaction-emoji' : 'reaction-text' }, label),
    );
    reactionHost.append(bubble);
    while (reactionHost.children.length > 3) reactionHost.firstElementChild?.remove();
    const hide = setTimeout(() => {
      bubble.classList.add('out');
      reactionTimers.delete(hide);
      const remove = setTimeout(() => {
        bubble.remove();
        reactionTimers.delete(remove);
      }, 300);
      reactionTimers.add(remove);
    }, 2600);
    reactionTimers.add(hide);
  };

  const renderRecord = () => replaceChildren(recordHost, view ? recordBadge(view, key, format, t) : null);

  const renderLive = () => {
    const others = rivals();
    reactionButton.hidden = others.length === 0;
    if (others.length === 0) closeReactions?.();
    replaceChildren(liveHost, renderLiveBoards(others.slice(0, RACE_SIZE - 1), ctx, gameId));
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

  /**
   * Jouable : débloquée par sa progression, déjà gagnée, ou rejointe en direct auprès d'un ami tant que la
   * course n'est pas complète.
   */
  const canPlay = (state: GameState) => {
    const won = wonKeys(state, ctx.me.id);
    return game.definition.isUnlocked(key, won) || won.has(key) || canJoinRace(rivals().length);
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
        h('p', { class: 'muted' }, rivals().length >= RACE_SIZE ? t.raceFull : t.lockedHint),
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
          screenHeader(
            game.keyLabel(key, ctx.lang),
            () => ctx.navigate({ name: 'game', game: gameId }),
            t,
            recordHost,
            reactionButton,
          ),
          liveHost,
          boardHost,
          reactionHost,
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
    onReaction: showReaction,
    dispose: () => {
      submitAbandon();
      unmountGame?.();
      closeReactions?.();
      for (const timer of reactionTimers) clearTimeout(timer);
      reactionTimers.clear();
      ctx.live.setActivity({ type: 'idle' });
    },
  };
}
