import { type ChatMessage, type GameId, LIMITS } from '../../../shared/platform/protocol.ts';
import { avatar } from '../avatar.ts';
import type { AppContext, ScreenHandle } from '../context.ts';
import { h, replaceChildren } from '../dom.ts';
import { formatTime } from '../i18n.ts';
import { errorMessage, screenHeader, toast } from '../ui.ts';

/** Salon global : historique court et messages en direct. */
export function mountChat(host: HTMLElement, ctx: AppContext, from?: GameId): ScreenHandle {
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

  const renderMessages = () => {
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

  replaceChildren(
    host,
    screenHeader(t.chat, () => ctx.navigate(from ? { name: 'game', game: from } : { name: 'hub' }), t),
    list,
    form,
  );
  renderMessages();
  const unsubscribe = ctx.chat.subscribe(renderMessages);
  void ctx.chat
    .load()
    .then(renderMessages)
    .catch((error: unknown) => toast(errorMessage(error, t)));

  return { dispose: unsubscribe };
}
