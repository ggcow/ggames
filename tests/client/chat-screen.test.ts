import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../../src/client/platform/api.ts';
import { ChatStore } from '../../src/client/platform/chat.ts';
import { chatScreen } from '../../src/client/platform/chat-panel.ts';
import type { AppContext } from '../../src/client/platform/context.ts';
import { LiveClient } from '../../src/client/platform/live.ts';
import { createLocalStore } from '../../src/client/platform/storage.ts';
import { PLATFORM_STRINGS } from '../../src/client/platform/strings.ts';
import { mainSection, section } from '../../src/client/platform/ui.ts';
import type { Account } from '../../src/shared/platform/protocol.ts';

const me: Account = { id: 'abc123', name: 'Léa', created: 1, login: 'lea', avatar: '🐶' };

/** Contexte d'application réel, sans réseau : l'API répond des listes vides, le temps réel n'est pas connecté. */
function context(): AppContext {
  const api = new ApiClient(vi.fn(async () => new Response('[]', { status: 200 })));
  return {
    api,
    live: new LiveClient(() => {
      throw new Error('pas de connexion dans ce test');
    }, 'ws://test'),
    chat: new ChatStore(api, createLocalStore(null), me.id),
    lang: 'fr',
    t: PLATFORM_STRINGS.fr,
    me,
    navigate: vi.fn(),
    setLang: vi.fn(),
    setMe: vi.fn(),
    logout: vi.fn(async () => undefined),
  };
}

describe('écran avec salon', () => {
  it('place le contenu puis le salon dans une même mise en page', () => {
    const host = document.createElement('div');
    const screen = chatScreen(context());
    screen.content.append(document.createElement('p'));
    screen.show(host);
    const layout = host.firstElementChild;
    expect(layout?.classList.contains('with-chat')).toBe(true);
    expect(layout?.children[0]).toBe(screen.content);
    expect(layout?.children[1]?.classList.contains('chat-section')).toBe(true);
    expect(layout?.children[1]?.querySelector('.section-title')?.textContent).toBe(PLATFORM_STRINGS.fr.chat);
    screen.dispose();
  });

  it('ne remonte pas le salon quand l’écran se redessine, sauf s’il a été retiré', () => {
    const host = document.createElement('div');
    const screen = chatScreen(context());
    screen.show(host);
    const input = host.querySelector<HTMLInputElement>('.chat-input');
    if (!input) throw new Error('saisie du salon attendue');
    input.value = 'en cours';
    screen.show(host);
    expect(host.querySelector('.chat-input')).toBe(input);
    expect(input.value).toBe('en cours');

    host.replaceChildren();
    screen.show(host);
    expect(host.querySelector('.with-chat')).not.toBeNull();
    screen.dispose();
  });
});

describe('sections', () => {
  it('distingue la section principale, qui prend plus de place sur un écran large', () => {
    const main = mainSection('Niveaux', document.createElement('div'));
    expect(main.classList.contains('section')).toBe(true);
    expect(main.classList.contains('main-section')).toBe(true);
    expect(main.querySelector('.section-title')?.textContent).toBe('Niveaux');
    expect(section('En ligne').classList.contains('main-section')).toBe(false);
  });
});
