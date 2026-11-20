import type { SessionResponse } from '../../../shared/platform/protocol.ts';
import type { ApiClient } from '../api.ts';
import { h, noTranslate, replaceChildren } from '../dom.ts';
import type { Lang } from '../i18n.ts';
import type { PlatformStrings } from '../strings.ts';
import { errorMessage } from '../ui.ts';

export interface LoginOptions {
  api: ApiClient;
  t: PlatformStrings;
  lang: Lang;
  onSession(session: SessionResponse): void;
  onSwitchLang(): void;
}

/** Écran de connexion / création de compte (avant toute session). */
export function mountLogin(host: HTMLElement, options: LoginOptions): void {
  const { api, t } = options;
  let mode: 'login' | 'register' = 'login';

  const login = h('input', { type: 'text', placeholder: t.loginId, maxLength: 16, autocomplete: 'username' });
  const password = h('input', { type: 'password', placeholder: t.password, autocomplete: 'current-password' });
  const message = h('p', { class: 'error', attrs: { role: 'alert' } });
  const submit = h('button', { class: 'btn primary', type: 'submit' });
  const toggle = h('button', { class: 'link', type: 'button' });

  const render = () => {
    submit.textContent = mode === 'login' ? t.login : t.register;
    toggle.textContent = mode === 'login' ? t.noAccount : t.haveAccount;
    password.placeholder = mode === 'register' ? `${t.password} (${t.passwordHint})` : t.password;
    password.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    message.textContent = '';
  };

  toggle.addEventListener('click', () => {
    mode = mode === 'login' ? 'register' : 'login';
    render();
  });

  const form = h(
    'form',
    {
      class: 'panel stack',
      on: {
        submit: (event) => {
          event.preventDefault();
          submit.disabled = true;
          const credentials = { login: login.value, password: password.value };
          (mode === 'login' ? api.login(credentials) : api.register(credentials))
            .then(options.onSession)
            .catch((error: unknown) => {
              message.textContent = errorMessage(error, t);
            })
            .finally(() => {
              submit.disabled = false;
            });
        },
      },
    },
    login,
    password,
    message,
    submit,
    toggle,
  );

  replaceChildren(
    host,
    h(
      'div',
      { class: 'login-top' },
      h(
        'button',
        { class: 'round small', attrs: { 'aria-label': t.switchLang }, on: { click: options.onSwitchLang } },
        t.langShort,
      ),
    ),
    h(
      'div',
      { class: 'brand big' },
      h('div', { class: 'brand-icons', attrs: { 'aria-hidden': 'true' } }, '🧪🎲🧩'),
      noTranslate(h('h1', null, t.appName)),
      h('p', null, t.tagline),
    ),
    form,
  );
  render();
}
