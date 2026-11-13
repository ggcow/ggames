// Composants d'interface communs : notification, fenêtre modale, en-tête d'écran, sections, chargement.

import { ApiError, NETWORK_ERROR } from './api.ts';
import { type Child, h, replaceChildren } from './dom.ts';
import type { PlatformStrings } from './strings.ts';

export function toast(message: string): void {
  const element = h('div', { class: 'toast', attrs: { role: 'status' } }, message);
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
    { class: 'modal', attrs: { role: 'dialog', 'aria-modal': 'true' } },
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
              class: button.primary ? 'btn primary' : 'btn',
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

/** Ferme toutes les fenêtres modales ouvertes (appelé à chaque changement d'écran). */
export function closeModals(): void {
  for (const modal of document.querySelectorAll('.modal')) modal.remove();
}

/** Barre du haut : bouton retour rond, titre centré, actions éventuelles à droite. */
export function screenHeader(
  title: string,
  back: (() => void) | null,
  t: PlatformStrings,
  ...extra: Child[]
): HTMLElement {
  return h(
    'header',
    { class: 'topbar' },
    back
      ? h('button', { class: 'round', attrs: { 'aria-label': t.back }, on: { click: back } }, '‹')
      : h('span', { class: 'round-spacer' }),
    h('h2', { class: 'title' }, title),
    h('div', { class: 'topbar-extra' }, ...extra),
  );
}

export function section(title: string, ...children: Child[]): HTMLElement {
  return h('section', { class: 'section' }, h('h3', { class: 'section-title' }, title), ...children);
}

/** Petite étiquette arrondie (statistique, statut). */
export const chip = (text: string, tone = ''): HTMLElement => h('span', { class: `chip ${tone}` }, text);

/** Message lisible pour une erreur d'API. */
export function errorMessage(error: unknown, t: PlatformStrings): string {
  if (!(error instanceof ApiError)) return t.error_generic;
  if (error.status === NETWORK_ERROR) return t.error_network;
  if (error.status === 401) return t.error_credentials;
  if (error.status === 403) return t.lockedHint;
  if (error.status === 409) return t.error_nameTaken;
  if (error.status === 429) return t.error_tooMany;
  if (error.status === 400) return t.error_invalid;
  return t.error_generic;
}

export function loading(host: HTMLElement, t: PlatformStrings): void {
  replaceChildren(
    host,
    h('div', { class: 'loading', attrs: { 'aria-label': t.loading } }, h('span', { class: 'spinner' })),
  );
}
