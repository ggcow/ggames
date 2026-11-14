// Enregistrement vocal court, partagé par le salon et les courses. Le bouton d'envoi décide
// d'envoyer le message ; l'annulation jette l'enregistrement.

import { LIMITS } from '../../shared/platform/protocol.ts';

export type RecorderError = 'permission' | 'tooLong';

export interface VoiceRecorderOptions {
  onRecorded(blob: Blob, durationMs: number): void;
  onError(error: RecorderError): void;
  onState(recording: boolean, seconds: number): void;
}

export interface VoiceRecorder {
  readonly supported: boolean;
  readonly recording: boolean;
  start(): void;
  cancel(): void;
  send(): void;
  dispose(): void;
}

export function createVoiceRecorder(options: VoiceRecorderOptions): VoiceRecorder {
  const supported = typeof MediaRecorder !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: Blob[] = [];
  let started = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let starting = false;
  let pendingSend = false;
  let active = false;
  let disposed = false;

  const stopTracks = () => {
    stream?.getTracks().forEach((track) => {
      track.stop();
    });
    stream = null;
  };

  const finish = (finished: MediaRecorder) => {
    const send = pendingSend;
    pendingSend = false;
    const duration = Math.min(LIMITS.voiceDurationMs, Math.max(1, Date.now() - started));
    const blob = new Blob(chunks, { type: finished.mimeType || 'audio/webm' });
    chunks = [];
    stopTracks();
    recorder = null;
    active = false;
    if (!disposed) options.onState(false, 0);
    if (disposed || !send || blob.size === 0) return;
    if (blob.size > LIMITS.voiceBytes) {
      options.onError('tooLong');
      return;
    }
    options.onRecorded(blob, duration);
  };

  const stop = (send: boolean) => {
    if (!recorder) return;
    pendingSend = send;
    if (timer) clearInterval(timer);
    timer = null;
    active = false;
    options.onState(false, 0);
    if (recorder.state !== 'inactive') recorder.stop();
    else recorder = null;
  };

  const start = () => {
    if (!supported || starting || recorder || disposed) return;
    starting = true;
    void navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((media) => {
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
        active = true;
        chunks = [];
        started = Date.now();
        next.addEventListener('dataavailable', (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        });
        next.addEventListener('stop', () => finish(next));
        next.start();
        options.onState(true, 0);
        timer = setInterval(() => {
          const seconds = Math.ceil((Date.now() - started) / 1000);
          options.onState(true, seconds);
          if (Date.now() - started >= LIMITS.voiceDurationMs) stop(true);
        }, 250);
      })
      .catch(() => {
        stopTracks();
        recorder = null;
        active = false;
        options.onError('permission');
      })
      .finally(() => {
        starting = false;
      });
  };

  const cancel = () => stop(false);
  const send = () => stop(true);

  const dispose = () => {
    disposed = true;
    if (timer) clearInterval(timer);
    timer = null;
    if (recorder && recorder.state !== 'inactive') {
      pendingSend = false;
      recorder.stop();
    }
    stopTracks();
    recorder = null;
    active = false;
  };

  return {
    supported,
    get recording() {
      return active;
    },
    start,
    cancel,
    send,
    dispose,
  };
}
