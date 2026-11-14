// Salon intégré à une page : messages texte et notes vocales normales.

import { type ChatMessage, LIMITS, type VoiceNote } from '../../shared/platform/protocol.ts';
import { avatar } from './avatar.ts';
import type { AppContext } from './context.ts';
import { h, replaceChildren } from './dom.ts';
import { formatDuration, formatTime } from './i18n.ts';
import { createVoiceRecorder } from './recorder.ts';
import { errorMessage, toast } from './ui.ts';

export interface ChatPanel {
  element: HTMLElement;
  dispose(): void;
}

type TimelineItem = { at: number; kind: 'text'; message: ChatMessage } | { at: number; kind: 'voice'; note: VoiceNote };

export function chatPanel(ctx: AppContext): ChatPanel {
  const { t } = ctx;
  const list = h('div', { class: 'chat-list', attrs: { 'aria-live': 'polite' } });
  const audioCache = new Map<string, string>();
  let currentAudio: HTMLAudioElement | null = null;
  let currentButton: HTMLButtonElement | null = null;
  let disposed = false;

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
          h('strong', null, message.name),
          h('small', null, formatTime(message.at, ctx.lang)),
        ),
        h('p', { class: 'chat-text' }, message.text),
      ),
    );

  const stopAudio = () => {
    currentAudio?.pause();
    currentAudio = null;
    if (currentButton) {
      currentButton.disabled = false;
      currentButton.textContent = '▶';
      currentButton = null;
    }
  };

  const preloadVoice = (note: VoiceNote) => {
    if (audioCache.has(note.id)) return;
    void ctx.api
      .voice(note.id)
      .then((blob) => {
        if (!disposed) audioCache.set(note.id, URL.createObjectURL(blob));
      })
      .catch(() => undefined);
  };

  const playVoice = async (note: VoiceNote, button: HTMLButtonElement) => {
    stopAudio();
    button.disabled = true;
    button.textContent = '⏸';
    currentButton = button;
    try {
      let url = audioCache.get(note.id);
      if (!url) {
        const blob = await ctx.api.voice(note.id);
        if (disposed) return;
        url = URL.createObjectURL(blob);
        audioCache.set(note.id, url);
      }
      if (disposed) return;
      const audio = new Audio(url);
      currentAudio = audio;
      audio.addEventListener('ended', stopAudio);
      audio.addEventListener('error', () => {
        stopAudio();
        toast(t.voiceError);
      });
      await audio.play();
    } catch (error) {
      stopAudio();
      toast(errorMessage(error, t));
    }
  };

  const voiceRow = (note: VoiceNote) => {
    const mine = note.player === ctx.me.id;
    const play = h(
      'button',
      {
        class: 'voice-play',
        type: 'button',
        attrs: { 'aria-label': t.voicePlay },
        on: { click: () => void playVoice(note, play) },
      },
      '▶',
    );
    return h(
      'div',
      { class: `chat-message voice ${mine ? 'me' : ''}` },
      avatar(note.player, note.name, 'sm'),
      h(
        'div',
        { class: 'chat-bubble voice-bubble' },
        h('div', { class: 'chat-meta' }, h('strong', null, note.name), h('small', null, formatTime(note.at, ctx.lang))),
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
    for (const item of items) if (item.kind === 'voice') preloadVoice(item.note);
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
      disposed = true;
      recorder.dispose();
      stopAudio();
      for (const url of audioCache.values()) URL.revokeObjectURL(url);
      audioCache.clear();
      unsubscribe();
    },
  };
}
