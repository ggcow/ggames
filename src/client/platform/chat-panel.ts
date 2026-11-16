// Salon intégré à une page : messages texte et notes vocales normales.

import { type ChatMessage, LIMITS, type VoiceNote } from '../../shared/platform/protocol.ts';
import { avatar } from './avatar.ts';
import type { AppContext } from './context.ts';
import { type Child, h, noTranslate, replaceChildren } from './dom.ts';
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

/** Écran accompagné du salon : sous le contenu sur un téléphone, à sa droite quand la fenêtre est large. */
export interface ChatScreen {
  /** Partie de l'écran redessinée à chaque changement. */
  content: HTMLElement;
  /** Place contenu et salon dans `host`, une seule fois : le salon garde sa saisie et son défilement. */
  show(host: HTMLElement): void;
  dispose(): void;
}

/**
 * Disposition sur une fenêtre large : `single`, une colonne de panneaux à côté du salon ; `side`, en plus,
 * une colonne latérale à gauche (`sideColumn`) quand la fenêtre est assez large.
 */
export type ChatScreenLayout = 'single' | 'side';

export function chatScreen(ctx: AppContext, layout: ChatScreenLayout): ChatScreen {
  const content = h('div', { class: 'screen-content' });
  const chat = chatPanel(ctx);
  const aside = section(ctx.t.chat, chat.element);
  aside.classList.add('chat-section');
  const element = h('div', { class: 'with-chat', attrs: { 'data-layout': layout } }, content, aside);
  return {
    content,
    show: (host) => {
      if (element.parentElement !== host) replaceChildren(host, element);
    },
    dispose: chat.dispose,
  };
}

/**
 * Colonne de panneaux d'un écran avec salon : sur une fenêtre large, ses panneaux restent empilés l'un sous
 * l'autre, à côté de la colonne suivante ; sur un téléphone, elle s'efface et ses panneaux suivent le fil.
 */
export const panelColumn = (...panels: Child[]): HTMLElement => h('div', { class: 'panel-column' }, ...panels);

/** Colonne latérale d'un écran `side` : à gauche sur une fenêtre large, après le reste sur un téléphone. */
export const sideColumn = (...panels: Child[]): HTMLElement =>
  h('div', { class: 'panel-column side-column' }, ...panels);
