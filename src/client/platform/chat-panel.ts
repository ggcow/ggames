// Salon intégré à une page : messages texte, notes vocales et lecture par destinataire.

import { type ChatMessage, LIMITS, type VoiceNote } from '../../shared/platform/protocol.ts';
import { avatar } from './avatar.ts';
import type { AppContext } from './context.ts';
import { h, replaceChildren } from './dom.ts';
import { formatDuration, formatTime } from './i18n.ts';
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
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: Blob[] = [];
  let recordingStarted = 0;
  let recordingTimer: ReturnType<typeof setInterval> | null = null;
  let starting = false;
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
      audio.addEventListener('ended', () => {
        const mine = note.player === ctx.me.id;
        stopAudio();
        if (!mine) void ctx.api.markVoiceRead(note.id).catch(() => undefined);
      });
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
          mine ? h('small', { class: 'voice-read' }, `${note.readCount}/${note.total}`) : null,
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
      ...ctx.chat.voices
        .filter((note) => note.player === ctx.me.id || !note.read)
        .map((note) => ({ at: note.at, kind: 'voice' as const, note })),
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

  const canRecord = typeof MediaRecorder !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
  const recordingLabel = h('span', { class: 'recording-time' });
  recordingLabel.hidden = true;
  const mic = canRecord
    ? h(
        'button',
        {
          class: 'round small mic-button',
          type: 'button',
          attrs: { 'aria-label': t.voiceRecord },
          on: { click: () => void toggleRecording() },
        },
        '🎙',
      )
    : null;

  const stopRecording = () => {
    if (recordingTimer) clearInterval(recordingTimer);
    recordingTimer = null;
    recordingLabel.hidden = true;
    if (mic) {
      mic.textContent = '🎙';
      mic.setAttribute('aria-label', t.voiceRecord);
    }
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  };

  const finishRecording = async (finished: MediaRecorder) => {
    const duration = Math.min(LIMITS.voiceDurationMs, Math.max(1, Date.now() - recordingStarted));
    const blob = new Blob(chunks, { type: finished.mimeType || 'audio/webm' });
    chunks = [];
    stream?.getTracks().forEach((track) => {
      track.stop();
    });
    stream = null;
    recorder = null;
    if (disposed || blob.size === 0) return;
    if (blob.size > LIMITS.voiceBytes) {
      toast(t.voiceTooLong);
      return;
    }
    try {
      await ctx.api.uploadVoice(blob, duration);
    } catch (error) {
      toast(errorMessage(error, t));
    }
  };

  const toggleRecording = async () => {
    if (starting) return;
    if (recorder) {
      stopRecording();
      return;
    }
    starting = true;
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (disposed) {
        media.getTracks().forEach((track) => {
          track.stop();
        });
        return;
      }
      stream = media;
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const next = new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
      recorder = next;
      chunks = [];
      recordingStarted = Date.now();
      next.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      });
      next.addEventListener('stop', () => void finishRecording(next));
      next.start();
      if (mic) {
        mic.textContent = '⏹';
        mic.setAttribute('aria-label', t.voiceStop);
      }
      recordingLabel.hidden = false;
      recordingLabel.textContent = t.voiceRecording(0);
      recordingTimer = setInterval(() => {
        const seconds = Math.ceil((Date.now() - recordingStarted) / 1000);
        recordingLabel.textContent = t.voiceRecording(seconds);
        if (Date.now() - recordingStarted >= LIMITS.voiceDurationMs) stopRecording();
      }, 250);
    } catch {
      if (recordingTimer) clearInterval(recordingTimer);
      recordingTimer = null;
      recordingLabel.hidden = true;
      if (mic) {
        mic.textContent = '🎙';
        mic.setAttribute('aria-label', t.voiceRecord);
      }
      stream?.getTracks().forEach((track) => {
        track.stop();
      });
      stream = null;
      recorder = null;
      chunks = [];
      toast(t.voicePermission);
    } finally {
      starting = false;
    }
  };

  const input = h('input', {
    class: 'chat-input',
    type: 'text',
    placeholder: t.chatPlaceholder,
    maxLength: LIMITS.chat,
    autocomplete: 'off',
    attrs: { 'aria-label': t.chatPlaceholder },
  });
  const form = h(
    'form',
    {
      class: 'chat-form',
      on: {
        submit: (event) => {
          event.preventDefault();
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
    h('button', { class: 'btn primary', type: 'submit' }, t.send),
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
      if (recordingTimer) clearInterval(recordingTimer);
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      stream?.getTracks().forEach((track) => {
        track.stop();
      });
      stopAudio();
      for (const url of audioCache.values()) URL.revokeObjectURL(url);
      audioCache.clear();
      unsubscribe();
    },
  };
}
