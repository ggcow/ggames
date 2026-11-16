import type {
  GameState,
  RaceVoice,
  RaceVoiceRead,
  ReactionNotice,
  RecordEntry,
} from '../../../shared/platform/protocol.ts';
import { competitionRanks } from '../../../shared/platform/ranking.ts';
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
import { type Child, h, noTranslate, replaceChildren } from '../dom.ts';
import { formatDuration, type Lang } from '../i18n.ts';
import { reactionLabel } from '../reactions.ts';
import { createVoiceRecorder, type VoiceRecorder } from '../recorder.ts';
import type { PlatformStrings } from '../strings.ts';
import { errorMessage, loading, screenHeader, showModal, toast } from '../ui.ts';
import { createVoicePlayer, setPlayButton, type VoicePlayerError } from '../voice-player.ts';
import { renderLiveBoards } from './online.ts';

/** Rangs montrés par le podium d'un niveau. */
const PODIUM_SIZE = 3;

/** Avatars montrés au plus dans le badge du record quand plusieurs joueurs le partagent. */
const BADGE_HOLDERS = 3;

/**
 * Record de la clé en badge compact pour l'en-tête : avatars de ses détenteurs (plusieurs à égalité) et score,
 * phrase complète en titre. Le toucher ouvre le podium du niveau.
 */
export function recordBadge(
  view: GameView,
  key: string,
  format: ((value: number, lang: Lang) => string) | null,
  t: PlatformStrings,
  bestPossible: number | null,
  openPodium: () => void,
): HTMLElement | null {
  const records = view.state.records[key] ?? [];
  const best = records[0];
  if (!best || !format) return null;
  const holders = records.filter((record) => record.value === best.value);
  const names = holders.map((record) => view.playerName(record.player));
  const value = format(best.value, view.lang);
  const text = t.record(names.join(', '), value);
  const extra = holders.length - BADGE_HOLDERS;
  return h(
    'button',
    {
      class: 'chip record-badge',
      type: 'button',
      attrs: { title: text, 'aria-label': text },
      on: { click: openPodium },
    },
    best.value === bestPossible ? '💎' : '🏆',
    ...holders.slice(0, BADGE_HOLDERS).map((record, index) => avatar(record.player, names[index] ?? '?', 'xs')),
    extra > 0 ? noTranslate(h('small', null, `+${extra}`)) : null,
    value,
  );
}

/**
 * Classement d'une clé, rangs partagés à égalité, un 💎 sur chaque score égal au meilleur possible. `limit` ne
 * garde que les rangs jusqu'à lui (le podium), donc parfois plus de `limit` lignes.
 */
export function scoreList(
  records: readonly RecordEntry[],
  view: GameView,
  format: (value: number, lang: Lang) => string,
  bestPossible: number | null,
  limit = Number.POSITIVE_INFINITY,
): HTMLElement {
  const ranks = competitionRanks(records, (a, b) => a.value === b.value);
  const lines = records.flatMap((record, index) => {
    const rank = ranks[index] ?? index + 1;
    if (rank > limit) return [];
    const name = view.playerName(record.player);
    return [
      h(
        'li',
        { class: record.player === view.me ? 'me' : '' },
        noTranslate(h('span', { class: `rank rank-${rank}` }, String(rank))),
        avatar(record.player, name, 'xs'),
        noTranslate(h('span', { class: 'grow' }, name)),
        h('b', null, record.value === bestPossible ? '💎 ' : null, format(record.value, view.lang)),
      ),
    ];
  });
  return h('ol', { class: 'scores' }, ...lines);
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
  const bestPossible = game.definition.bestPossible(key);
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

  const voiceHost = h('div', { class: 'race-voices' });
  voiceHost.hidden = true;
  const recordingHost = h('div', { class: 'race-recording' });
  recordingHost.hidden = true;
  let raceVoices: RaceVoice[] = [];
  /** Notes retirées de son écran par le joueur ; les autres joueurs les gardent. */
  const dismissed = new Set<string>();
  let recording = false;
  let recordingSeconds = 0;
  let disposed = false;

  const playButtons = new Map<string, HTMLButtonElement>();
  const voicePlayer = createVoicePlayer({
    load: (id) => api.raceVoice(id),
    onChange: () => {
      for (const [id, button] of playButtons) setPlayButton(button, voicePlayer.playing === id, t);
    },
    onEnded: (id) => {
      const note = raceVoices.find((item) => item.id === id);
      if (note && note.player !== ctx.me.id) void api.markRaceVoiceRead(id).catch(() => undefined);
    },
    onError: (error: VoicePlayerError) =>
      toast(error.kind === 'playback' ? t.voicePlaybackError : errorMessage(error.error, t)),
  });

  /** Note touchée puis les notes des autres joueurs affichées en dessous. */
  const playFrom = (note: RaceVoice) => {
    if (voicePlayer.playing === note.id) {
      voicePlayer.stop();
      return;
    }
    const later = visibleVoices().filter((item) => item.at > note.at && item.player !== ctx.me.id);
    voicePlayer.play([note.id, ...later.map((item) => item.id)]);
  };

  const raceVoiceRow = (note: RaceVoice) => {
    const mine = note.player === ctx.me.id;
    const play = h(
      'button',
      {
        class: 'voice-play',
        type: 'button',
        attrs: { 'aria-label': t.voicePlay },
        on: { click: () => playFrom(note) },
      },
      '▶',
    );
    playButtons.set(note.id, play);
    setPlayButton(play, voicePlayer.playing === note.id, t);
    return h(
      'div',
      { class: 'race-voice' },
      avatar(note.player, note.name, 'xs'),
      play,
      h('span', { class: 'voice-duration' }, formatDuration(note.durationMs, ctx.lang)),
      mine ? h('small', { class: 'voice-read' }, `${note.readCount}/${note.total}`) : null,
      h(
        'button',
        {
          class: 'voice-dismiss',
          type: 'button',
          attrs: { 'aria-label': t.voiceDismiss },
          on: { click: () => dismissRaceVoice(note.id) },
        },
        '✕',
      ),
    );
  };

  let recorder: VoiceRecorder | null = null;
  let mic: HTMLButtonElement | null = null;
  const renderRecording = () => {
    recordingHost.hidden = !recording;
    if (!recording) return;
    replaceChildren(
      recordingHost,
      h('span', { class: 'recording-time' }, t.voiceTimer(recordingSeconds)),
      h(
        'button',
        {
          class: 'round small voice-send',
          type: 'button',
          attrs: { 'aria-label': t.voiceSend },
          on: { click: () => recorder?.send() },
        },
        '➤',
      ),
    );
  };
  /** Ses propres notes, et celles des autres pas encore écoutées. */
  const visibleVoices = () =>
    raceVoices.filter((note) => !dismissed.has(note.id) && (note.player === ctx.me.id || !note.read));
  const dismissRaceVoice = (id: string) => {
    dismissed.add(id);
    if (voicePlayer.playing === id) voicePlayer.stop();
    renderVoices();
  };
  const renderVoices = () => {
    const visible = visibleVoices();
    playButtons.clear();
    for (const note of visible) voicePlayer.preload(note.id);
    voiceHost.hidden = recording || visible.length === 0;
    replaceChildren(voiceHost, ...visible.map(raceVoiceRow));
  };

  recorder = createVoiceRecorder({
    onRecorded: (blob, duration) => {
      void api.uploadRaceVoice(gameId, key, blob, duration).catch((error: unknown) => toast(errorMessage(error, t)));
    },
    onError: (error) => toast(error === 'permission' ? t.voicePermission : t.voiceTooLong),
    onState: (active, seconds) => {
      recording = active;
      recordingSeconds = seconds;
      if (mic) {
        mic.textContent = active ? '✖' : '🎙';
        mic.setAttribute('aria-label', active ? t.voiceCancel : t.voiceRecord);
        mic.hidden = rivals().length === 0 && !active;
      }
      recordHost.hidden = active;
      reactionButton.hidden = rivals().length === 0 || active;
      renderRecording();
      renderVoices();
    },
  });
  mic = recorder.supported
    ? h(
        'button',
        {
          class: 'round small mic-button',
          type: 'button',
          attrs: { 'aria-label': t.voiceRecord },
          on: {
            click: () => {
              if (recorder?.recording) recorder.cancel();
              else recorder?.start();
            },
          },
        },
        '🎙',
      )
    : null;
  if (mic) mic.hidden = true;
  renderRecording();
  renderVoices();

  const showRaceVoice = (note: RaceVoice) => {
    if (note.game !== gameId || note.key !== key) return;
    if (raceVoices.some((item) => item.id === note.id)) return;
    raceVoices = [...raceVoices, note].sort((a, b) => a.at - b.at);
    renderVoices();
  };

  const showRaceVoiceRead = (read: RaceVoiceRead) => {
    const note = raceVoices.find((item) => item.id === read.id);
    if (!note) return;
    const updated = {
      ...note,
      readCount: read.readCount,
      total: read.total,
      read: note.read || read.player === ctx.me.id,
    };
    raceVoices = raceVoices.map((item) => (item.id === read.id ? updated : item));
    renderVoices();
  };

  const hideRaceVoice = (id: string) => {
    if (!raceVoices.some((item) => item.id === id)) return;
    raceVoices = raceVoices.filter((item) => item.id !== id);
    renderVoices();
  };

  const renderRecord = () =>
    replaceChildren(recordHost, view ? recordBadge(view, key, format, t, bestPossible, openPodium) : null);

  const renderLive = () => {
    const others = rivals();
    reactionButton.hidden = others.length === 0 || recording;
    if (mic) mic.hidden = others.length === 0 && !recording;
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
    if (!format || !view) return [];
    return [
      h('p', { class: 'modal-value' }, format(value, ctx.lang)),
      h('h3', { class: 'section-title' }, t.leaderboard),
      scoreList(records, view, format, bestPossible),
    ];
  };

  /** Podium du niveau : les trois premiers rangs, ex æquo compris. */
  const openPodium = () => {
    if (!format || !view) return;
    showModal(
      [
        h('div', { class: 'modal-emoji' }, '🏆'),
        h('h2', null, game.keyLabel(key, ctx.lang)),
        scoreList(view.state.records[key] ?? [], view, format, bestPossible, PODIUM_SIZE),
      ],
      [{ label: t.close }],
    );
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
    const perfect = won && value === bestPossible;
    showModal(
      [
        h('div', { class: 'modal-emoji' }, perfect ? '💎' : won ? '🎉' : '😵'),
        h('h2', null, won ? t.won : t.lost),
        perfect ? h('p', { class: 'perfect-note' }, t.perfect) : null,
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
            recordingHost,
            mic,
          ),
          liveHost,
          h('div', { class: 'race-overlay' }, voiceHost, reactionHost),
          boardHost,
        );
        renderLive();
        start();
        const startedAt = Date.now();
        void api
          .raceVoices(gameId, key)
          .then((notes) => {
            if (disposed) return;
            const known = new Set(notes.map((note) => note.id));
            const live = raceVoices.filter((note) => note.at > startedAt - 60_000 && !known.has(note.id));
            raceVoices = [...notes, ...live].sort((a, b) => a.at - b.at);
            renderVoices();
          })
          .catch(() => undefined);
      })
      .catch((error: unknown) => toast(errorMessage(error, t)));

  loading(host, t);
  void load();
  return {
    onDataChanged: () => void load(),
    onPresenceChanged: renderLive,
    onReaction: showReaction,
    onRaceVoice: showRaceVoice,
    onRaceVoiceRead: showRaceVoiceRead,
    onRaceVoiceGone: hideRaceVoice,
    dispose: () => {
      disposed = true;
      recorder?.dispose();
      voicePlayer.dispose();
      submitAbandon();
      unmountGame?.();
      closeReactions?.();
      for (const timer of reactionTimers) clearTimeout(timer);
      reactionTimers.clear();
      ctx.live.setActivity({ type: 'idle' });
    },
  };
}
