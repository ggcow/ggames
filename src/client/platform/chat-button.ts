// Bouton du salon avec pastille de non-lus, partagé par l'accueil et la page d'un jeu.

import type { GameId } from '../../shared/platform/protocol.ts';
import type { AppContext } from './context.ts';
import { h } from './dom.ts';

export interface ChatButton {
  element: HTMLButtonElement;
  dispose(): void;
}

export function chatButton(ctx: AppContext, from?: GameId): ChatButton {
  const badge = h('span', { class: 'chat-badge' });
  const element = h(
    'button',
    {
      class: 'round small chat-button',
      attrs: { 'aria-label': ctx.t.chat },
      on: { click: () => ctx.navigate(from ? { name: 'chat', game: from } : { name: 'chat' }) },
    },
    '💬',
    badge,
  );

  const update = () => {
    const unread = ctx.chat.unread;
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.hidden = unread === 0;
  };
  const unsubscribe = ctx.chat.subscribe(update);
  update();

  return { element, dispose: unsubscribe };
}
