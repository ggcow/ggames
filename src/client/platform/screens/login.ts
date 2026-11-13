import type { SessionResponse } from '../../../shared/platform/protocol.ts';
import type { ApiClient } from '../api.ts';
import { h, replaceChildren } from '../dom.ts';
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

  const name = h('input', { type: 'text', placeholder: t.name, maxLength: 16, autocomplete: 'username' });
  const password = h('input', { type: 'password', placeholder: t.password, autocomplete: 'current-password' });
  const message = h('p', { class: 'error' });
  const submit = h('button', { class: 'primary', type: 'submit' });
  const toggle = h('button', { class: 'ghost', type: 'button' });

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
      class: 'stack',
      on: {
        submit: (event) => {
          event.preventDefault();
          submit.disabled = true;
          const credentials = { name: name.value, password: password.value };
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
    name,
    password,
    message,
    submit,
    toggle,
  );

  replaceChildren(
    host,
    h('button', { class: 'ghost lang', on: { click: options.onSwitchLang } }, t.switchLang),
    h('div', { class: 'hero' }, h('h1', null, t.appName)),
    form,
  );
  render();
}
