import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PLATFORM_STRINGS } from '../../src/client/platform/strings.ts';
import { createVoicePlayer, setPlayButton, type VoicePlayerError } from '../../src/client/platform/voice-player.ts';

/** Élément audio factice : la lecture réussit, la fin et les erreurs sont déclenchées par le test. */
class FakeAudio extends EventTarget {
  static created: FakeAudio[] = [];
  src = '';
  played: string[] = [];
  paused = true;
  constructor() {
    super();
    FakeAudio.created.push(this);
  }
  play(): Promise<void> {
    this.paused = false;
    this.played.push(this.src);
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
  end(): void {
    this.dispatchEvent(new Event('ended'));
  }
  fail(): void {
    this.dispatchEvent(new Event('error'));
  }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function setup(load = (id: string) => Promise.resolve(new Blob([id]))) {
  const changes: (string | null)[] = [];
  const ended: string[] = [];
  const errors: VoicePlayerError[] = [];
  const player = createVoicePlayer({
    load,
    onChange: () => changes.push(player.playing),
    onEnded: (id) => ended.push(id),
    onError: (error) => errors.push(error),
  });
  return { player, changes, ended, errors };
}

beforeEach(() => {
  FakeAudio.created = [];
  let next = 0;
  vi.stubGlobal('Audio', FakeAudio);
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
    next += 1;
    return `blob:${next}`;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('lecteur de notes vocales', () => {
  it('enchaîne les notes dans l’ordre avec un seul élément audio', async () => {
    const { player, changes, ended } = setup();
    player.play(['a', 'b', 'c']);
    await flush();
    expect(player.playing).toBe('a');
    const audio = FakeAudio.created[0];
    if (!audio) throw new Error('aucun élément audio');

    audio.end();
    await flush();
    expect(player.playing).toBe('b');
    audio.end();
    await flush();
    audio.end();
    await flush();

    expect(FakeAudio.created).toHaveLength(1);
    expect(audio.played).toEqual(['blob:1', 'blob:2', 'blob:3']);
    expect(ended).toEqual(['a', 'b', 'c']);
    expect(changes).toEqual(['a', 'b', 'c', null]);
    expect(player.playing).toBeNull();
  });

  it('arrête la lecture et oublie la suite de la file', async () => {
    const { player, ended } = setup();
    player.play(['a', 'b']);
    await flush();
    player.stop();
    const audio = FakeAudio.created[0];
    expect(audio?.paused).toBe(true);
    expect(player.playing).toBeNull();
    audio?.end();
    await flush();
    expect(ended).toEqual([]);
    expect(player.playing).toBeNull();
  });

  it('remplace la file quand on touche une autre note', async () => {
    const { player } = setup();
    player.play(['a', 'b']);
    await flush();
    player.play(['c']);
    await flush();
    expect(player.playing).toBe('c');
    FakeAudio.created[0]?.end();
    await flush();
    expect(player.playing).toBeNull();
  });

  it('télécharge une note préchargée une seule fois', async () => {
    const load = vi.fn((id: string) => Promise.resolve(new Blob([id])));
    const { player } = setup(load);
    player.preload('a');
    player.preload('a');
    await flush();
    player.play(['a']);
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('signale un téléchargement refusé et s’arrête', async () => {
    const failure = new Error('404');
    const { player, errors } = setup(() => Promise.reject(failure));
    player.play(['a', 'b']);
    await flush();
    expect(errors).toEqual([{ kind: 'load', error: failure }]);
    expect(player.playing).toBeNull();
  });

  it('signale un audio illisible et s’arrête', async () => {
    const { player, errors } = setup();
    player.play(['a', 'b']);
    await flush();
    FakeAudio.created[0]?.fail();
    expect(errors).toEqual([{ kind: 'playback' }]);
    expect(player.playing).toBeNull();
  });

  it('libère les audios téléchargés à la fermeture', async () => {
    const { player } = setup();
    player.play(['a']);
    await flush();
    player.dispose();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1');
    expect(player.playing).toBeNull();
  });
});

describe('bouton de lecture', () => {
  it('montre lecture ou arrêt selon la note en cours', () => {
    const t = PLATFORM_STRINGS.fr;
    const button = document.createElement('button');
    setPlayButton(button, true, t);
    expect(button.textContent).toBe('⏸');
    expect(button.getAttribute('aria-label')).toBe(t.voiceStop);
    expect(button.classList.contains('playing')).toBe(true);
    setPlayButton(button, false, t);
    expect(button.textContent).toBe('▶');
    expect(button.getAttribute('aria-label')).toBe(t.voicePlay);
    expect(button.classList.contains('playing')).toBe(false);
  });
});
