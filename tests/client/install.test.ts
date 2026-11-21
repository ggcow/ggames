import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../../src/client/platform/api.ts';
import { ChatStore } from '../../src/client/platform/chat.ts';
import type { AppContext } from '../../src/client/platform/context.ts';
import { type InstallEnvironment, Installer, installMode } from '../../src/client/platform/install.ts';
import { LiveClient } from '../../src/client/platform/live.ts';
import { mountHub } from '../../src/client/platform/screens/hub.ts';
import { createLocalStore } from '../../src/client/platform/storage.ts';
import { PLATFORM_STRINGS } from '../../src/client/platform/strings.ts';
import type { Account } from '../../src/shared/platform/protocol.ts';

const t = PLATFORM_STRINGS.fr;
const me: Account = { id: 'abc123', name: 'Léa', created: 1, login: 'lea', avatar: '🐶' };

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Safari/604.1';
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';
const EDGE = `${CHROME} Edg/131.0.0.0`;
const OPERA = `${CHROME} OPR/115.0.0.0`;
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';
const FIREFOX_ANDROID = 'Mozilla/5.0 (Android 14; Mobile; rv:133.0) Gecko/133.0 Firefox/133.0';
const WECHAT = `${IPHONE} MicroMessenger/8.0.50(0x1800322c) NetType/WIFI Language/zh_CN`;

const browser = (userAgent: string, standalone = false): InstallEnvironment => ({ userAgent, standalone });

/** Événement `beforeinstallprompt` tel que l'envoie Chromium. */
function promptEvent(): Event & { prompt: ReturnType<typeof vi.fn> } {
  return Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn(async () => ({ outcome: 'accepted' })),
  });
}

function context(installer: Installer): AppContext {
  const api = new ApiClient(vi.fn(async () => new Response('[]', { status: 200 })));
  return {
    api,
    live: new LiveClient(() => {
      throw new Error('pas de connexion dans ce test');
    }, 'ws://test'),
    chat: new ChatStore(api, createLocalStore(null), me.id),
    installer,
    lang: 'fr',
    t,
    me,
    navigate: vi.fn(),
    setLang: vi.fn(),
    setMe: vi.fn(),
    logout: vi.fn(async () => undefined),
  };
}

/** Accueil monté, liste des jeux chargée. */
async function hub(installer: Installer): Promise<{ host: HTMLElement; dispose: () => void }> {
  const host = document.createElement('div');
  const handle = mountHub(host, context(installer));
  await vi.waitFor(() => expect(host.querySelector('.brand')).not.toBeNull());
  return { host, dispose: () => handle.dispose?.() };
}

afterEach(() => {
  for (const modal of document.querySelectorAll('.modal')) modal.remove();
});

describe("mode d'installation", () => {
  it("ne propose rien depuis l'écran d'accueil", () => {
    expect(installMode(browser(ANDROID, true), true)).toBe('installed');
    expect(installMode(browser(IPHONE, true), false)).toBe('installed');
  });

  it("passe par la fenêtre du navigateur quand il l'offre", () => {
    expect(installMode(browser(ANDROID), true)).toBe('prompt');
  });

  it('explique Safari iOS, WeChat et le menu des autres navigateurs', () => {
    expect(installMode(browser(IPHONE), false)).toBe('ios');
    expect(installMode(browser(WECHAT), false)).toBe('wechat');
    expect(installMode(browser(ANDROID), false)).toBe('menu');
  });

  it('explique Chrome et Edge sur ordinateur, et renvoie Firefox vers eux', () => {
    expect(installMode(browser(CHROME), false)).toBe('chrome');
    expect(installMode(browser(EDGE), false)).toBe('edge');
    expect(installMode(browser(FIREFOX), false)).toBe('firefox');
    expect(installMode(browser(CHROME), true)).toBe('prompt');
  });

  it('garde le menu du navigateur sur téléphone et pour un navigateur inconnu sur ordinateur', () => {
    expect(installMode(browser(FIREFOX_ANDROID), false)).toBe('menu');
    expect(installMode(browser(OPERA), false)).toBe('menu');
    expect(installMode(browser(''), false)).toBe('menu');
  });

  it("renvoie WeChat vers le navigateur, même s'il offrait une fenêtre", () => {
    expect(installMode(browser(WECHAT), true)).toBe('wechat');
  });
});

describe('suivi de l’installation', () => {
  it('garde l’invitation du navigateur et prévient les abonnés', () => {
    const target = new EventTarget();
    const installer = new Installer(browser(ANDROID));
    installer.listen(target);
    const listener = vi.fn();
    installer.subscribe(listener);
    const event = promptEvent();
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(installer.mode()).toBe('prompt');
    expect(listener).toHaveBeenCalledOnce();
  });

  it('ignore un événement sans fenêtre d’installation', () => {
    const target = new EventTarget();
    const installer = new Installer(browser(ANDROID));
    installer.listen(target);
    target.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }));
    expect(installer.mode()).toBe('menu');
  });

  it('n’ouvre la fenêtre qu’une fois par invitation', async () => {
    const target = new EventTarget();
    const installer = new Installer(browser(ANDROID));
    installer.listen(target);
    const event = promptEvent();
    target.dispatchEvent(event);
    await installer.prompt();
    await installer.prompt();
    expect(event.prompt).toHaveBeenCalledOnce();
    expect(installer.mode()).toBe('menu');
  });

  it('se tient pour installée après `appinstalled`', () => {
    const target = new EventTarget();
    const installer = new Installer(browser(ANDROID));
    installer.listen(target);
    target.dispatchEvent(promptEvent());
    target.dispatchEvent(new Event('appinstalled'));
    expect(installer.mode()).toBe('installed');
  });

  it('ne prévient plus un abonné désinscrit', () => {
    const target = new EventTarget();
    const installer = new Installer(browser(ANDROID));
    installer.listen(target);
    const listener = vi.fn();
    installer.subscribe(listener)();
    target.dispatchEvent(promptEvent());
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("bouton d'installation de l'accueil", () => {
  it("n'apparaît pas dans l'appli installée", async () => {
    const { host, dispose } = await hub(new Installer(browser(ANDROID, true)));
    expect(host.querySelector('.install-card')).toBeNull();
    dispose();
  });

  it('ouvre la fenêtre du navigateur', async () => {
    const target = new EventTarget();
    const installer = new Installer(browser(ANDROID));
    installer.listen(target);
    const event = promptEvent();
    target.dispatchEvent(event);
    const { host, dispose } = await hub(installer);
    host.querySelector<HTMLButtonElement>('.install-card')?.click();
    expect(event.prompt).toHaveBeenCalledOnce();
    expect(document.querySelector('.modal')).toBeNull();
    dispose();
  });

  it.each([
    [IPHONE, t.installIos],
    [WECHAT, t.installWechat],
    [ANDROID, t.installMenu],
    [CHROME, t.installChrome],
    [EDGE, t.installEdge],
    [FIREFOX, t.installFirefox],
  ])('explique comment installer (%s)', async (userAgent, help) => {
    const { host, dispose } = await hub(new Installer(browser(userAgent)));
    const card = host.querySelector<HTMLButtonElement>('.install-card');
    expect(card?.textContent).toContain(t.installApp);
    card?.click();
    expect(document.querySelector('.modal')?.textContent).toContain(help);
    dispose();
  });

  it("disparaît dès que l'appli est installée", async () => {
    const target = new EventTarget();
    const installer = new Installer(browser(ANDROID));
    installer.listen(target);
    const { host, dispose } = await hub(installer);
    expect(host.querySelector('.install-card')).not.toBeNull();
    target.dispatchEvent(new Event('appinstalled'));
    expect(host.querySelector('.install-card')).toBeNull();
    dispose();
  });
});
