import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError, NETWORK_ERROR } from '../../src/client/platform/api.ts';
import { parseSession } from '../../src/client/platform/app.ts';
import { avatar } from '../../src/client/platform/avatar.ts';
import { append, h, noTranslate } from '../../src/client/platform/dom.ts';
import { gameIcon } from '../../src/client/platform/game-icon.ts';
import { detectLang, formatDuration, isLang } from '../../src/client/platform/i18n.ts';
import { formatRoute, parseRoute, type Route } from '../../src/client/platform/router.ts';
import { createLocalStore } from '../../src/client/platform/storage.ts';
import { PLATFORM_STRINGS } from '../../src/client/platform/strings.ts';
import { closeModals, errorMessage, screenHeader, showModal, withName } from '../../src/client/platform/ui.ts';

describe('router', () => {
  const routes: Route[] = [
    { name: 'login' },
    { name: 'hub' },
    { name: 'game', game: 'fioles' },
    { name: 'player', game: 'fioles', player: 'abc123' },
    { name: 'play', game: 'fioles', key: 'c:12' },
    { name: 'run', run: 'abc123' },
  ];

  it.each(routes)('fait l’aller-retour pour %j', (route) => {
    expect(parseRoute(formatRoute(route))).toEqual(route);
  });

  it('traite un hash vide comme l’accueil', () => {
    expect(parseRoute('')).toEqual({ name: 'hub' });
    expect(parseRoute('#/')).toEqual({ name: 'hub' });
  });

  it.each(['#/nope', '#/g/', '#/g/Fioles', '#/g/fioles/p', '#/g/fioles/play/%E0%A4%A', '#/run/a/b'])(
    'rejette %s',
    (hash) => {
      expect(parseRoute(hash)).toBeNull();
    },
  );
});

describe('dom', () => {
  it('construit un élément avec propriétés, styles, écouteurs et texte échappé', () => {
    const click = vi.fn();
    const element = h(
      'button',
      { class: 'primary', disabled: true, style: { color: 'red' }, attrs: { 'data-x': '1' }, on: { click } },
      '<b>texte</b>',
      null,
      false,
      42,
    );
    expect(element.className).toBe('primary');
    expect(element.disabled).toBe(true);
    expect(element.style.getPropertyValue('color')).toBe('red');
    expect(element.dataset['x']).toBe('1');
    expect(element.textContent).toBe('<b>texte</b>42');
    expect(element.querySelector('b')).toBeNull();
    element.disabled = false;
    element.click();
    expect(click).toHaveBeenCalledOnce();
  });

  it('append ignore les valeurs vides', () => {
    const parent = h('div');
    append(parent, undefined, 'a', h('span'));
    expect(parent.childNodes).toHaveLength(2);
  });
});

describe('traduction automatique du navigateur', () => {
  const isProtected = (element: Element | null | undefined) =>
    element?.getAttribute('translate') === 'no' && element.classList.contains('notranslate');

  it('soustrait un élément à la traduction en gardant ses classes', () => {
    const element = noTranslate(h('strong', { class: 'nom' }, '月红'));
    expect(isProtected(element)).toBe(true);
    expect(element.classList.contains('nom')).toBe(true);
  });

  it('protège l’initiale d’un avatar', () => {
    expect(isProtected(avatar('abc123', '月红'))).toBe(true);
  });

  it('protège le pseudo dans une phrase traduite, quelle que soit sa place', () => {
    for (const lang of ['fr', 'zh'] as const) {
      const line = h('strong', null, ...withName(PLATFORM_STRINGS[lang].replayOf, '月红'));
      expect(line.textContent).toBe(PLATFORM_STRINGS[lang].replayOf('月红'));
      expect(isProtected(line.querySelector('span'))).toBe(true);
      expect(line.querySelector('span')?.textContent).toBe('月红');
    }
  });
});

describe('icône de jeu', () => {
  it('affiche un emoji en texte, masqué des lecteurs d’écran', () => {
    const icon = gameIcon({ kind: 'emoji', emoji: '🧪' });
    expect(icon.tagName).toBe('SPAN');
    expect(icon.textContent).toBe('🧪');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
  });

  it('affiche une image décorative servie par le site', () => {
    const icon = gameIcon({ kind: 'image', src: '/games/x/icon.webp' });
    expect(icon.tagName).toBe('IMG');
    expect(icon.getAttribute('src')).toBe('/games/x/icon.webp');
    expect(icon.getAttribute('alt')).toBe('');
    expect(icon.className).toBe('game-glyph');
  });
});

describe('en-tête d’écran', () => {
  it('place un bouton retour rond au chevron devant le titre, puis les actions à droite', () => {
    const back = vi.fn();
    const extra = h('span', { class: 'extra' }, 'x');
    const header = screenHeader('Niveau 3', back, PLATFORM_STRINGS.fr, extra);

    const button = header.querySelector<HTMLButtonElement>('button.round');
    expect(button?.getAttribute('aria-label')).toBe(PLATFORM_STRINGS.fr.back);
    expect(button?.querySelector('.chevron')?.textContent).toBe('');
    button?.click();
    expect(back).toHaveBeenCalledOnce();

    expect(header.querySelector('.title')?.textContent).toBe('Niveau 3');
    expect(header.querySelector('.topbar-extra')?.firstElementChild).toBe(extra);
  });
});

describe('i18n', () => {
  it('détecte le chinois, sinon le français', () => {
    expect(detectLang(['zh-CN', 'en'])).toBe('zh');
    expect(detectLang(['en-US', 'fr'])).toBe('fr');
    expect(isLang('zh')).toBe(true);
    expect(isLang('en')).toBe(false);
  });

  it('formate les durées', () => {
    expect(formatDuration(5_000, 'fr')).toBe('5 s');
    expect(formatDuration(65_000, 'fr')).toBe('1 min 05 s');
    expect(formatDuration(3_660_000, 'fr')).toBe('1 h 01');
    expect(formatDuration(65_000, 'zh')).toBe('1分5秒');
  });

  it('a les mêmes textes dans chaque langue', () => {
    expect(Object.keys(PLATFORM_STRINGS.zh).sort()).toEqual(Object.keys(PLATFORM_STRINGS.fr).sort());
  });
});

describe('stockage local', () => {
  it('lit, écrit et efface avec un préfixe', () => {
    const store = createLocalStore(window.localStorage);
    store.set('k', { a: 1 });
    expect(window.localStorage.getItem('ggames.k')).toBe('{"a":1}');
    expect(store.get('k', (v) => v as { a: number })).toEqual({ a: 1 });
    store.remove('k');
    expect(store.get('k', (v) => v)).toBeNull();
  });

  it('survit à un stockage absent ou défaillant', () => {
    const broken = {
      getItem: () => {
        throw new Error('bloqué');
      },
      setItem: () => {
        throw new Error('plein');
      },
      removeItem: () => {
        throw new Error('bloqué');
      },
    } as unknown as Storage;
    for (const storage of [null, broken]) {
      const store = createLocalStore(storage);
      expect(() => store.set('k', 1)).not.toThrow();
      expect(store.get('k', (v) => v)).toBeNull();
      expect(() => store.remove('k')).not.toThrow();
    }
  });

  it('traite une valeur illisible comme absente', () => {
    window.localStorage.setItem('ggames.bad', '{');
    expect(createLocalStore(window.localStorage).get('bad', (v) => v)).toBeNull();
  });
});

describe('session mémorisée', () => {
  it('accepte une session bien formée et rejette le reste', () => {
    const session = {
      token: 't'.repeat(48),
      player: { id: 'abc123', name: 'Léa', created: 1, login: 'lea', avatar: '🦄' },
    };
    expect(parseSession(session)).toEqual(session);
    expect(parseSession({ token: 1, player: session.player })).toBeNull();
    expect(parseSession({ token: 'x', player: { id: 'X', name: 'a', created: 1, login: 'a' } })).toBeNull();
    expect(parseSession({ token: 'x', player: { ...session.player, login: 3 } })).toBeNull();
  });

  it('prend le pseudo comme identifiant d’une session enregistrée sans identifiant', () => {
    const player = { id: 'abc123', name: 'Léa', created: 1 };
    expect(parseSession({ token: 'x', player })).toEqual({
      token: 'x',
      player: { ...player, login: 'Léa', avatar: null },
    });
  });

  it('ignore un animal absent ou hors du catalogue d’une session enregistrée', () => {
    const player = { id: 'abc123', name: 'Léa', created: 1, login: 'lea', avatar: '🚗' };
    expect(parseSession({ token: 'x', player })?.player.avatar).toBeNull();
  });
});

describe('client API', () => {
  const respond = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it('envoie le jeton et le corps JSON', async () => {
    const fetch = respond(200, { id: 'abc123', name: 'A', created: 1 });
    const api = new ApiClient(fetch);
    api.setToken('secret');
    await api.rename('A');
    expect(fetch).toHaveBeenCalledWith('/api/me', {
      method: 'PATCH',
      headers: { Authorization: 'Bearer secret', 'content-type': 'application/json' },
      body: '{"name":"A"}',
    });
  });

  it('envoie le changement d’animal et lit la liste des joueurs', async () => {
    const fetch = respond(200, []);
    const api = new ApiClient(fetch);
    await api.changeAvatar('🦄');
    await api.players();
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/me/avatar',
      expect.objectContaining({ method: 'PATCH', body: '{"avatar":"🦄"}' }),
    );
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/players', expect.objectContaining({ method: 'GET' }));
  });

  it('envoie le changement d’identifiant avec le mot de passe', async () => {
    const fetch = respond(200, { id: 'abc123', name: 'A', created: 1, login: 'b' });
    const api = new ApiClient(fetch);
    await api.changeLogin({ login: 'b', password: 'secret' });
    expect(fetch).toHaveBeenCalledWith('/api/me/login', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: '{"login":"b","password":"secret"}',
    });
  });

  it('transforme une erreur serveur en ApiError avec son message', async () => {
    const api = new ApiClient(respond(409, { error: 'name taken' }));
    await expect(api.register({ login: 'a', password: 'abcd' })).rejects.toEqual(new ApiError(409, 'name taken'));
  });

  it('signale une erreur réseau', async () => {
    const api = new ApiClient(async () => {
      throw new TypeError('offline');
    });
    await expect(api.games()).rejects.toMatchObject({ status: NETWORK_ERROR });
  });

  it('prévient quand la session est refusée', async () => {
    const api = new ApiClient(respond(401, { error: 'unauthorized' }));
    const handler = vi.fn();
    api.onUnauthorized(handler);
    api.setToken('expired');
    await expect(api.me()).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('donne un message lisible par type d’erreur', () => {
    const t = PLATFORM_STRINGS.fr;
    expect(errorMessage(new ApiError(NETWORK_ERROR, ''), t)).toBe(t.error_network);
    expect(errorMessage(new ApiError(409, 'name taken'), t)).toBe(t.error_nameTaken);
    expect(errorMessage(new Error('x'), t)).toBe(t.error_generic);
  });

  it('télécharge et envoie des notes vocales', async () => {
    const audio = new Blob([new Uint8Array([1, 2])], { type: 'audio/webm' });
    const note = { id: 'v2', player: 'abc123', name: 'Léa', durationMs: 1000, mime: 'audio/webm', at: 1 };
    const raceNote = {
      ...note,
      id: 'r1',
      game: 'fioles',
      key: 'c:1',
      readCount: 0,
      total: 1,
      read: false,
    };
    const fetch = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === '/api/voices/v1' || input === '/api/race-voices/v1') {
        return new Response(audio, { status: 200 });
      }
      if (input.endsWith('/read')) {
        return new Response(JSON.stringify({ readCount: 1, total: 1 }), { status: 200 });
      }
      if (input.includes('/games/')) {
        return new Response(JSON.stringify(init?.method === 'GET' ? [raceNote] : raceNote), { status: 200 });
      }
      return new Response(JSON.stringify(note), { status: 200 });
    });
    const api = new ApiClient(fetch);
    api.setToken('secret');

    expect((await api.voice('v1')).type).toBe('audio/webm');
    expect((await api.uploadVoice(audio, 1000)).id).toBe('v2');
    expect((await api.raceVoices('fioles', 'c:1'))[0]?.id).toBe('r1');
    expect((await api.uploadRaceVoice('fioles', 'c:1', audio, 1000)).id).toBe('r1');
    expect(await api.markRaceVoiceRead('r1')).toEqual({ readCount: 1, total: 1 });

    expect(fetch).toHaveBeenCalledWith(
      '/api/voices',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer secret',
          'content-type': 'audio/webm',
          'x-voice-duration': '1000',
        }),
      }),
    );
    expect(fetch).toHaveBeenCalledWith(
      '/api/games/fioles/voices?key=c%3A1',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetch).toHaveBeenCalledWith(
      '/api/race-voices/r1/read',
      expect.objectContaining({ method: 'POST', headers: { Authorization: 'Bearer secret' } }),
    );
  });
});

describe('fenêtres modales', () => {
  it('se ferment par leurs boutons ou toutes ensemble au changement d’écran', () => {
    const action = vi.fn();
    showModal([h('p', null, 'a')], [{ label: 'OK', action }]);
    document.querySelector<HTMLButtonElement>('.modal button')?.click();
    expect(action).toHaveBeenCalledOnce();
    expect(document.querySelectorAll('.modal')).toHaveLength(0);
    showModal([], []);
    showModal([], []);
    closeModals();
    expect(document.querySelectorAll('.modal')).toHaveLength(0);
  });
});
