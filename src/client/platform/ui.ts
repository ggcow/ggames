// Composants d'interface communs : notification, fenêtre modale, en-tête d'écran, message d'erreur.

import { ApiError, NETWORK_ERROR } from './api.ts';
import { type Child, h, replaceChildren } from './dom.ts';
import type { PlatformStrings } from './strings.ts';

export function toast(message: string): void {
  const element = h('div', { class: 'toast' }, message);
  document.body.append(element);
  requestAnimationFrame(() => element.classList.add('on'));
  setTimeout(() => {
    element.classList.remove('on');
    setTimeout(() => element.remove(), 300);
  }, 2200);
}

export interface ModalButton {
  label: string;
  primary?: boolean;
  action?: () => void;
}

export function showModal(content: Child[], buttons: ModalButton[]): () => void {
  const close = () => overlay.remove();
  const overlay = h(
    'div',
    { class: 'modal' },
    h(
      'div',
      { class: 'modal-box' },
      ...content,
      h(
        'div',
        { class: 'modal-buttons' },
        ...buttons.map((button) =>
          h(
            'button',
            {
              class: button.primary ? 'primary' : '',
              on: {
                click: () => {
                  close();
                  button.action?.();
                },
              },
            },
            button.label,
          ),
        ),
      ),
    ),
  );
  document.body.append(overlay);
  return close;
}

export function screenHeader(title: string, back: (() => void) | null, ...extra: Child[]): HTMLElement {
  return h(
    'header',
    { class: 'topbar' },
    back ? h('button', { class: 'ghost', on: { click: back } }, '←') : h('span', { class: 'spacer-btn' }),
    h('h2', { class: 'title' }, title),
    h('div', { class: 'topbar-extra' }, ...extra),
  );
}

export function section(title: string, ...children: Child[]): HTMLElement {
  return h('section', { class: 'section' }, h('h3', null, title), ...children);
}

/** Message lisible pour une erreur d'API. */
export function errorMessage(error: unknown, t: PlatformStrings): string {
  if (!(error instanceof ApiError)) return t.error_generic;
  if (error.status === NETWORK_ERROR) return t.error_network;
  if (error.status === 401) return t.error_credentials;
  if (error.status === 409) return t.error_nameTaken;
  if (error.status === 429) return t.error_tooMany;
  if (error.status === 400) return t.error_invalid;
  return t.error_generic;
}

export function loading(host: HTMLElement, t: PlatformStrings): void {
  replaceChildren(host, h('p', { class: 'muted center' }, t.loading));
}
