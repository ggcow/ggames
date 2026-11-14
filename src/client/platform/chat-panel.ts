// Salon intégré à une page : historique court et messages en direct, sans écran séparé.

import { type ChatMessage, LIMITS } from '../../shared/platform/protocol.ts';
import { avatar } from './avatar.ts';
import type { AppContext } from './context.ts';
import { h, replaceChildren } from './dom.ts';
import { formatTime } from './i18n.ts';
import { errorMessage, toast } from './ui.ts';

export interface ChatPanel {
  element: HTMLElement;
  dispose(): void;
}

export function chatPanel(ctx: AppContext): ChatPanel {
  const { t } = ctx;
  const list = h('div', { class: 'chat-list', attrs: { 'aria-live': 'polite' } });

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

  const render = () => {
    if (!ctx.chat.isLoaded) {
      replaceChildren(list, h('p', { class: 'muted empty-line' }, t.loading));
      return;
    }
    const messages = ctx.chat.messages;
    replaceChildren(
      list,
      ...(messages.length > 0 ? messages.map(messageRow) : [h('p', { class: 'muted empty-line' }, t.noMessages)]),
    );
    list.scrollTop = list.scrollHeight;
    if (ctx.chat.unread > 0) ctx.chat.markRead();
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
    h('button', { class: 'btn primary', type: 'submit' }, t.send),
  );

  const element = h('div', { class: 'chat-panel' }, list, form);
  render();
  const unsubscribe = ctx.chat.subscribe(render);
  void ctx.chat
    .load()
    .then(render)
    .catch((error: unknown) => toast(errorMessage(error, t)));

  return { element, dispose: unsubscribe };
}
