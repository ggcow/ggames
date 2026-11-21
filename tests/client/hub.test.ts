import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../../src/client/platform/api.ts';
import { ChatStore } from '../../src/client/platform/chat.ts';
import type { AppContext } from '../../src/client/platform/context.ts';
import { Installer } from '../../src/client/platform/install.ts';
import { LiveClient } from '../../src/client/platform/live.ts';
import { mountHub } from '../../src/client/platform/screens/hub.ts';
import { createLocalStore } from '../../src/client/platform/storage.ts';
import { PLATFORM_STRINGS } from '../../src/client/platform/strings.ts';
import type { Account } from '../../src/shared/platform/protocol.ts';

const t = PLATFORM_STRINGS.fr;
const me: Account = { id: 'abc123', name: 'Léa', created: 1, login: 'lea', avatar: '🐶' };

function context(logout: () => Promise<void>): AppContext {
  const api = new ApiClient(vi.fn(async () => new Response('[]', { status: 200 })));
  return {
    api,
    live: new LiveClient(() => {
      throw new Error('pas de connexion dans ce test');
    }, 'ws://test'),
    chat: new ChatStore(api, createLocalStore(null), me.id),
    installer: new Installer({ userAgent: '', standalone: true }),
    lang: 'fr',
    t,
    me,
    navigate: vi.fn(),
    setLang: vi.fn(),
    setMe: vi.fn(),
    logout,
  };
}

describe('accueil', () => {
  it("écrit le nom de l'appli à l'abri de la traduction automatique", async () => {
    expect(PLATFORM_STRINGS.fr.appName).toBe('Jouons ensemble');
    expect(PLATFORM_STRINGS.zh.appName).toBe('一起玩');
    const host = document.createElement('div');
    const handle = mountHub(host, context(vi.fn(async () => undefined)));
    await vi.waitFor(() => expect(host.querySelector('.brand')).not.toBeNull());
    const title = host.querySelector('.brand h1');
    expect(title?.textContent).toBe('Jouons ensemble');
    expect(title?.getAttribute('translate')).toBe('no');
    handle.dispose?.();
  });

  it('dessine le bouton de déconnexion sans caractère, absent des polices de WeChat', async () => {
    const logout = vi.fn(async () => undefined);
    const host = document.createElement('div');
    const handle = mountHub(host, context(logout));
    await vi.waitFor(() => expect(host.querySelector('.brand')).not.toBeNull());
    const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${t.logout}"]`);
    expect(button?.textContent).toBe('');
    expect(button?.querySelector('.power')).not.toBeNull();
    button?.click();
    expect(logout).toHaveBeenCalledOnce();
    handle.dispose?.();
  });

  it('met les joueurs en ligne dans la barre latérale, à part des jeux', async () => {
    const host = document.createElement('div');
    const handle = mountHub(host, context(vi.fn(async () => undefined)));
    await vi.waitFor(() => expect(host.querySelector('.brand')).not.toBeNull());
    const titles = (selector: string) =>
      [...host.querySelectorAll(`${selector} .section-title`)].map((title) => title.textContent);
    expect(titles('.side-bar')).toEqual([t.online]);
    expect(titles('.screen-content')).toEqual([t.games]);
    handle.dispose?.();
  });
});
