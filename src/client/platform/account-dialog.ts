// FenÃªtre Â« Modifier Â» du compte : pseudo affichÃ© et identifiant de connexion, modifiables sÃ©parÃ©ment.

import { type Account, cleanName, LIMITS } from '../../shared/platform/protocol.ts';
import { type ApiClient, ApiError } from './api.ts';
import { h } from './dom.ts';
import type { PlatformStrings } from './strings.ts';
import { errorMessage, showModal } from './ui.ts';

export interface AccountDialogOptions {
  api: ApiClient;
  t: PlatformStrings;
  me: Account;
  /** AppelÃ© Ã  la fermeture si le compte a changÃ©, mÃªme quand une seule des deux modifications a rÃ©ussi. */
  onChanged(me: Account): void;
}

/** Ouvre la fenÃªtre. Le mot de passe n'est demandÃ© que pour changer d'identifiant. */
export function openAccountDialog({ api, t, me, onChanged }: AccountDialogOptions): void {
  let current = me;
  const name = h('input', { type: 'text', value: me.name, maxLength: LIMITS.name, autocomplete: 'off' });
  const login = h('input', { type: 'text', value: me.login, maxLength: LIMITS.name, autocomplete: 'username' });
  const password = h('input', { type: 'password', autocomplete: 'current-password' });
  const passwordField = field(t.passwordToChangeLogin, password);
  const message = h('p', { class: 'error', attrs: { role: 'alert' } });
  const save = h('button', { class: 'btn primary', type: 'submit' }, t.save);

  const loginChanged = () => cleanName(login.value) !== current.login;
  const showPassword = () => {
    passwordField.hidden = !loginChanged();
  };
  login.addEventListener('input', showPassword);
  showPassword();

  const finish = () => {
    close();
    if (current !== me) onChanged(current);
  };

  // L'identifiant passe en premier : c'est lui qui peut Ã©chouer sur le mot de passe, et le pseudo n'est alors
  // pas changÃ© Ã  moitiÃ© de l'enregistrement.
  const apply = async () => {
    if (loginChanged()) current = await api.changeLogin({ login: login.value, password: password.value });
    if (cleanName(name.value) !== current.name) current = await api.rename(name.value);
  };

  const form = h(
    'form',
    {
      class: 'stack account-form',
      on: {
        submit: (event) => {
          event.preventDefault();
          save.disabled = true;
          message.textContent = '';
          apply()
            .then(finish)
            .catch((error: unknown) => {
              message.textContent =
                error instanceof ApiError && error.status === 403 ? t.error_password : errorMessage(error, t);
            })
            .finally(() => {
              save.disabled = false;
              showPassword();
            });
        },
      },
    },
    field(t.nameLabel, name),
    field(t.loginId, login),
    passwordField,
    message,
    save,
  );

  const close = showModal([h('h2', null, t.editAccount), form], [{ label: t.close, action: finish }]);
}

const field = (label: string, input: HTMLInputElement): HTMLLabelElement =>
  h('label', { class: 'field' }, h('span', null, label), input);
