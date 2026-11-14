import type {
  GameState,
  RaceVoice,
  RaceVoiceRead,
  ReactionNotice,
  RecordEntry,
} from '../../../shared/platform/protocol.ts';
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
import { formatDuration, type Lang } from '../i18n.ts';
import { reactionLabel } from '../reactions.ts';
import { createVoiceRecorder, type VoiceRecorder } from '../recorder.ts';
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

  const voiceHost = h('div', { class: 'race-voices' });
  voiceHost.hidden = true;
  const recordingHost = h('div', { class: 'race-recording' });
  recordingHost.hidden = true;
  const audioCache = new Map<string, string>();
  let raceVoices: RaceVoice[] = [];
  let recording = false;
  let recordingSeconds = 0;
  let currentAudio: HTMLAudioElement | null = null;
  let currentButton: HTMLButtonElement | null = null;
  let disposed = false;

  const stopRaceAudio = () => {
    currentAudio?.pause();
    currentAudio = null;
    if (currentButton) {
      currentButton.disabled = false;
      currentButton.textContent = '▶';
      currentButton = null;
    }
  };

  const preloadRaceVoice = (note: RaceVoice) => {
    if (audioCache.has(note.id)) return;
    void api
      .raceVoice(note.id)
      .then((blob) => {
        if (!disposed) audioCache.set(note.id, URL.createObjectURL(blob));
      })
      .catch(() => undefined);
  };

  const playRaceVoice = async (note: RaceVoice, button: HTMLButtonElement) => {
    stopRaceAudio();
    button.disabled = true;
    button.textContent = '⏸';
    currentButton = button;
    try {
      let url = audioCache.get(note.id);
      if (!url) {
        const blob = await api.raceVoice(note.id);
        if (disposed) return;
        url = URL.createObjectURL(blob);
        audioCache.set(note.id, url);
      }
      if (disposed) return;
      const audio = new Audio(url);
      currentAudio = audio;
      audio.addEventListener('ended', () => {
        const mine = note.player === ctx.me.id;
        stopRaceAudio();
        if (!mine) void api.markRaceVoiceRead(note.id).catch(() => undefined);
      });
      audio.addEventListener('error', () => {
        stopRaceAudio();
        toast(t.voiceError);
      });
      await audio.play();
    } catch (error) {
      stopRaceAudio();
      toast(errorMessage(error, t));
    }
  };

  const raceVoiceRow = (note: RaceVoice) => {
    const mine = note.player === ctx.me.id;
    const play = h(
      'button',
      {
        class: 'voice-play',
        type: 'button',
        attrs: { 'aria-label': t.voicePlay },
        on: { click: () => void playRaceVoice(note, play) },
      },
      '▶',
    );
    return h(
      'div',
      { class: 'race-voice' },
      avatar(note.player, note.name, 'xs'),
      play,
      h('span', { class: 'voice-duration' }, formatDuration(note.durationMs, ctx.lang)),
      mine ? h('small', { class: 'voice-read' }, `${note.readCount}/${note.total}`) : null,
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
  const renderVoices = () => {
    const visible = raceVoices.filter((note) => note.player === ctx.me.id || !note.read);
    for (const note of visible) preloadRaceVoice(note);
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
    if (updated.player === ctx.me.id && updated.total > 0 && updated.readCount >= updated.total) {
      raceVoices = raceVoices.filter((item) => item.id !== read.id);
    } else {
      raceVoices = raceVoices.map((item) => (item.id === read.id ? updated : item));
    }
    renderVoices();
  };

  const renderRecord = () => replaceChildren(recordHost, view ? recordBadge(view, key, format, t) : null);

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
            recordingHost,
            mic,
          ),
          liveHost,
          voiceHost,
          boardHost,
          reactionHost,
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
    dispose: () => {
      disposed = true;
      recorder?.dispose();
      stopRaceAudio();
      for (const url of audioCache.values()) URL.revokeObjectURL(url);
      audioCache.clear();
      submitAbandon();
      unmountGame?.();
      closeReactions?.();
      for (const timer of reactionTimers) clearTimeout(timer);
      reactionTimers.clear();
      ctx.live.setActivity({ type: 'idle' });
    },
  };
}
