import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError, NETWORK_ERROR } from '../../src/client/platform/api.ts';
import { parseSession } from '../../src/client/platform/app.ts';
import { append, h } from '../../src/client/platform/dom.ts';
import { detectLang, formatDuration, isLang } from '../../src/client/platform/i18n.ts';
import { formatRoute, parseRoute, type Route } from '../../src/client/platform/router.ts';
import { createLocalStore } from '../../src/client/platform/storage.ts';
import { PLATFORM_STRINGS } from '../../src/client/platform/strings.ts';
import { errorMessage } from '../../src/client/platform/ui.ts';

describe('router', () => {
  const routes: Route[] = [
    { name: 'login' },
    { name: 'hub' },
    { name: 'game', game: 'fioles' },
    { name: 'player', game: 'fioles', player: 'abc123' },
    { name: 'play', game: 'fioles', key: 'c:12' },
    { name: 'create', game: 'fioles' },
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
    const session = { token: 't'.repeat(48), player: { id: 'abc123', name: 'Léa', created: 1 } };
    expect(parseSession(session)).toEqual(session);
    expect(parseSession({ token: 1, player: session.player })).toBeNull();
    expect(parseSession({ token: 'x', player: { id: 'X', name: 'a', created: 1 } })).toBeNull();
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

  it('transforme une erreur serveur en ApiError avec son message', async () => {
    const api = new ApiClient(respond(409, { error: 'name taken' }));
    await expect(api.register({ name: 'a', password: 'abcd' })).rejects.toEqual(new ApiError(409, 'name taken'));
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
    expect(errorMessage(new ApiError(409, 'abc123'), t)).toBe(t.error_duplicate);
    expect(errorMessage(new Error('x'), t)).toBe(t.error_generic);
  });
});
