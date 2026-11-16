// Lecture des notes vocales d'une liste (salon ou course) : une note à la fois, puis les suivantes.

import type { PlatformStrings } from './strings.ts';

/** Échec de lecture : audio illisible par le navigateur, ou téléchargement refusé. */
export type VoicePlayerError = { kind: 'playback' } | { kind: 'load'; error: unknown };

export interface VoicePlayerOptions {
  load(id: string): Promise<Blob>;
  /** La note en cours a changé (début, fin, arrêt) : l'appelant met ses boutons à jour. */
  onChange(): void;
  /** Une note a été écoutée jusqu'au bout. */
  onEnded?(id: string): void;
  onError(error: VoicePlayerError): void;
}

export interface VoicePlayer {
  /** Note en cours de lecture, ou `null`. */
  readonly playing: string | null;
  /** Télécharge une note à l'avance pour que la lecture démarre sans attendre le réseau. */
  preload(id: string): void;
  /** Lit les notes dans l'ordre, chacune démarrant à la fin de la précédente. */
  play(ids: readonly string[]): void;
  stop(): void;
  dispose(): void;
}

export function createVoicePlayer(options: VoicePlayerOptions): VoicePlayer {
  const cache = new Map<string, string>();
  const pending = new Map<string, Promise<string>>();
  // Un seul élément audio pour toute la file : iOS n'autorise la lecture sans geste que sur un élément déjà
  // lancé par un geste, donc les notes suivantes doivent passer par le même.
  let audio: HTMLAudioElement | null = null;
  let queue: string[] = [];
  let playing: string | null = null;
  let generation = 0;
  let disposed = false;

  const source = (id: string): Promise<string> => {
    const cached = cache.get(id);
    if (cached) return Promise.resolve(cached);
    const inFlight = pending.get(id);
    if (inFlight) return inFlight;
    const request = options
      .load(id)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        if (disposed) URL.revokeObjectURL(url);
        else cache.set(id, url);
        return url;
      })
      .finally(() => pending.delete(id));
    pending.set(id, request);
    return request;
  };

  const setPlaying = (id: string | null) => {
    if (playing === id) return;
    playing = id;
    options.onChange();
  };

  const stop = () => {
    generation += 1;
    queue = [];
    audio?.pause();
    setPlaying(null);
  };

  const element = (): HTMLAudioElement => {
    if (audio) return audio;
    const created = new Audio();
    created.addEventListener('ended', () => {
      const ended = playing;
      if (ended === null) return;
      options.onEnded?.(ended);
      void advance();
    });
    created.addEventListener('error', () => {
      if (playing === null) return;
      stop();
      options.onError({ kind: 'playback' });
    });
    audio = created;
    return created;
  };

  const advance = async () => {
    const id = queue.shift() ?? null;
    generation += 1;
    const run = generation;
    setPlaying(id);
    if (id === null) return;
    try {
      const url = await source(id);
      if (disposed || run !== generation) return;
      const target = element();
      target.src = url;
      await target.play();
    } catch (error) {
      if (run !== generation) return;
      stop();
      options.onError({ kind: 'load', error });
    }
  };

  return {
    get playing() {
      return playing;
    },
    preload: (id) => {
      if (!disposed) void source(id).catch(() => undefined);
    },
    play: (ids) => {
      stop();
      queue = [...ids];
      void advance();
    },
    stop,
    dispose: () => {
      stop();
      disposed = true;
      for (const url of cache.values()) URL.revokeObjectURL(url);
      cache.clear();
    },
  };
}

/** Bouton d'une note : lecture, ou arrêt pendant qu'elle joue. */
export function setPlayButton(button: HTMLButtonElement, playing: boolean, t: PlatformStrings): void {
  button.textContent = playing ? '⏸' : '▶';
  button.setAttribute('aria-label', playing ? t.voiceStop : t.voicePlay);
  button.classList.toggle('playing', playing);
}
