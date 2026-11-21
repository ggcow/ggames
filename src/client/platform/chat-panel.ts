// Salon intégré à une page : messages texte et notes vocales normales.

import { type ChatMessage, LIMITS, type VoiceNote } from '../../shared/platform/protocol.ts';
import { avatar } from './avatar.ts';
import type { AppContext } from './context.ts';
import { h, noTranslate, replaceChildren } from './dom.ts';
import { formatDuration, formatTime } from './i18n.ts';
import { createVoiceRecorder } from './recorder.ts';
import { errorMessage, section, toast } from './ui.ts';
import { createVoicePlayer, setPlayButton, type VoicePlayerError } from './voice-player.ts';

export interface ChatPanel {
  element: HTMLElement;
  dispose(): void;
}

type TimelineItem = { at: number; kind: 'text'; message: ChatMessage } | { at: number; kind: 'voice'; note: VoiceNote };

export function chatPanel(ctx: AppContext): ChatPanel {
  const { t } = ctx;
  const list = h('div', { class: 'chat-list', attrs: { 'aria-live': 'polite' } });
  const playButtons = new Map<string, HTMLButtonElement>();
  const updatePlayButtons = () => {
    for (const [id, button] of playButtons) setPlayButton(button, player.playing === id, t);
  };
  const player = createVoicePlayer({
    load: (id) => ctx.api.voice(id),
    onChange: updatePlayButtons,
    onError: (error: VoicePlayerError) =>
      toast(error.kind === 'playback' ? t.voicePlaybackError : errorMessage(error.error, t)),
  });

  const messageRow = (message: ChatMessage) =>
    h(
      'div',
      { class: `chat-message ${message.player === ctx.me.id ? 'me' : ''}` },
      avatar(message.player, message.name, 'sm'),
      h(
        'div',
        { class: 'chat-bubble' },
        h(
          'div',
          { class: 'chat-meta' },
          noTranslate(h('strong', null, message.name)),
          h('small', null, formatTime(message.at, ctx.lang)),
        ),
        h('p', { class: 'chat-text' }, message.text),
      ),
    );

  /** Note touchée puis les notes des autres joueurs qui la suivent dans le fil. */
  const playFrom = (note: VoiceNote) => {
    if (player.playing === note.id) {
      player.stop();
      return;
    }
    const later = ctx.chat.voices.filter((item) => item.at > note.at && item.player !== ctx.me.id);
    player.play([note.id, ...later.sort((a, b) => a.at - b.at).map((item) => item.id)]);
  };

  const voiceRow = (note: VoiceNote) => {
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
    setPlayButton(play, player.playing === note.id, t);
    return h(
      'div',
      { class: `chat-message voice ${mine ? 'me' : ''}` },
      avatar(note.player, note.name, 'sm'),
      h(
        'div',
        { class: 'chat-bubble voice-bubble' },
        h(
          'div',
          { class: 'chat-meta' },
          noTranslate(h('strong', null, note.name)),
          h('small', null, formatTime(note.at, ctx.lang)),
        ),
        h(
          'div',
          { class: 'voice-line' },
          play,
          h('span', { class: 'voice-duration' }, formatDuration(note.durationMs, ctx.lang)),
        ),
      ),
    );
  };

  const render = () => {
    if (!ctx.chat.isLoaded) {
      replaceChildren(list, h('p', { class: 'muted empty-line' }, t.loading));
      return;
    }
    const items: TimelineItem[] = [
      ...ctx.chat.messages.map((message) => ({ at: message.at, kind: 'text' as const, message })),
      ...ctx.chat.voices.map((note) => ({ at: note.at, kind: 'voice' as const, note })),
    ].sort((a, b) => a.at - b.at);
    playButtons.clear();
    for (const item of items) if (item.kind === 'voice') player.preload(item.note.id);
    replaceChildren(
      list,
      ...(items.length > 0
        ? items.map((item) => (item.kind === 'text' ? messageRow(item.message) : voiceRow(item.note)))
        : [h('p', { class: 'muted empty-line' }, t.noMessages)]),
    );
    list.scrollTop = list.scrollHeight;
    if (ctx.chat.unread > 0) ctx.chat.markRead();
  };

  const recordingLabel = h('span', { class: 'recording-time' });
  recordingLabel.hidden = true;
  const input = h('input', {
    class: 'chat-input',
    type: 'text',
    placeholder: t.chatPlaceholder,
    maxLength: LIMITS.chat,
    autocomplete: 'off',
    attrs: { 'aria-label': t.chatPlaceholder },
  });
  const sendButton = h('button', { class: 'btn primary', type: 'submit' }, t.send);
  let mic: HTMLButtonElement | null = null;
  const recorder = createVoiceRecorder({
    onRecorded: (blob, duration) => {
      void ctx.api.uploadVoice(blob, duration).catch((error: unknown) => toast(errorMessage(error, t)));
    },
    onError: (error) => toast(error === 'permission' ? t.voicePermission : t.voiceTooLong),
    onState: (recording, seconds) => {
      sendButton.textContent = recording ? t.voiceSend : t.send;
      sendButton.setAttribute('aria-label', recording ? t.voiceSend : t.send);
      input.disabled = recording;
      if (mic) {
        mic.textContent = recording ? '✖' : '🎙';
        mic.setAttribute('aria-label', recording ? t.voiceCancel : t.voiceRecord);
      }
      recordingLabel.hidden = !recording;
      recordingLabel.textContent = t.voiceTimer(seconds);
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
              if (recorder.recording) recorder.cancel();
              else recorder.start();
            },
          },
        },
        '🎙',
      )
    : null;

  const form = h(
    'form',
    {
      class: 'chat-form',
      on: {
        submit: (event) => {
          event.preventDefault();
          if (recorder.recording) {
            recorder.send();
            return;
          }
          const text = input.value.trim();
          if (!text) return;
          ctx.live.chat(text);
          input.value = '';
          input.focus();
        },
      },
    },
    input,
    recordingLabel,
    mic,
    sendButton,
  );

  const element = h('div', { class: 'chat-panel' }, list, form);
  render();
  const unsubscribe = ctx.chat.subscribe(render);
  void ctx.chat
    .load()
    .then(render)
    .catch((error: unknown) => toast(errorMessage(error, t)));

  return {
    element,
    dispose: () => {
      recorder.dispose();
      player.dispose();
      unsubscribe();
    },
  };
}

/**
 * Écran accompagné d'une barre latérale (joueurs en ligne…) et du salon : l'une puis l'autre sous le contenu sur un
 * téléphone ; sur une fenêtre large, la barre à gauche et le salon à droite, toujours visibles sur toute la hauteur.
 */
export interface ChatScreen {
  /** Partie de l'écran redessinée à chaque changement. */
  content: HTMLElement;
  /** Barre latérale, redessinée à chaque changement comme le contenu. */
  side: HTMLElement;
  /** Place contenu, barre et salon dans `host`, une seule fois : le salon garde sa saisie et son défilement. */
  show(host: HTMLElement): void;
  dispose(): void;
}

export function chatScreen(ctx: AppContext): ChatScreen {
  const content = h('div', { class: 'screen-content' });
  const side = h('div', { class: 'side-bar' });
  const chat = chatPanel(ctx);
  const aside = section(ctx.t.chat, chat.element);
  aside.classList.add('chat-section');
  const element = h('div', { class: 'with-chat' }, content, side, aside);
  return {
    content,
    side,
    show: (host) => {
      if (element.parentElement !== host) replaceChildren(host, element);
    },
    dispose: chat.dispose,
  };
}
