import { afterEach, describe, expect, it, vi } from 'vitest';
import { openAccountDialog } from '../../src/client/platform/account-dialog.ts';
import { ApiClient } from '../../src/client/platform/api.ts';
import { PLATFORM_STRINGS } from '../../src/client/platform/strings.ts';
import { closeModals } from '../../src/client/platform/ui.ts';
import type { Account } from '../../src/shared/platform/protocol.ts';

const t = PLATFORM_STRINGS.fr;
const me: Account = { id: 'abc123', name: 'Léa', created: 1, login: 'lea' };

type Reply = { status: number; body: unknown };

/** Client API dont chaque requête reçoit la réponse suivante de `replies`. */
function fakeApi(replies: Reply[]) {
  const fetch = vi.fn(async (_path: string, _init: RequestInit) => {
    const reply = replies.shift() ?? { status: 500, body: null };
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  });
  return { api: new ApiClient(fetch), fetch };
}

const inputs = () => [...document.querySelectorAll<HTMLInputElement>('.modal input')];
const passwordField = () => document.querySelector<HTMLInputElement>('.modal input[type="password"]')?.closest('label');
const type = (input: HTMLInputElement | undefined, value: string) => {
  if (!input) throw new Error('champ attendu');
  input.value = value;
  input.dispatchEvent(new Event('input'));
};
const submit = () => document.querySelector('.modal form')?.dispatchEvent(new Event('submit', { cancelable: true }));
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const bodies = (fetch: ReturnType<typeof fakeApi>['fetch']) =>
  fetch.mock.calls.map(([path, init]) => [path, init.method, init.body]);

afterEach(() => closeModals());

describe('fenêtre du compte', () => {
  it('remplit le pseudo et l’identifiant, et ne demande le mot de passe que pour changer d’identifiant', () => {
    openAccountDialog({ api: fakeApi([]).api, t, me, onChanged: vi.fn() });
    const [name, login] = inputs();
    expect(name?.value).toBe('Léa');
    expect(login?.value).toBe('lea');
    expect(passwordField()?.hidden).toBe(true);
    type(login, 'lea2');
    expect(passwordField()?.hidden).toBe(false);
    type(login, ' lea ');
    expect(passwordField()?.hidden).toBe(true);
  });

  it('change seulement le pseudo', async () => {
    const { api, fetch } = fakeApi([{ status: 200, body: { ...me, name: 'Lili' } }]);
    const onChanged = vi.fn();
    openAccountDialog({ api, t, me, onChanged });
    type(inputs()[0], 'Lili');
    submit();
    await settle();
    expect(bodies(fetch)).toEqual([['/api/me', 'PATCH', '{"name":"Lili"}']]);
    expect(onChanged).toHaveBeenCalledWith({ ...me, name: 'Lili' });
    expect(document.querySelector('.modal')).toBeNull();
  });

  it('change l’identifiant avant le pseudo, avec le mot de passe', async () => {
    const { api, fetch } = fakeApi([
      { status: 200, body: { ...me, login: 'lea2' } },
      { status: 200, body: { ...me, login: 'lea2', name: 'Lili' } },
    ]);
    const onChanged = vi.fn();
    openAccountDialog({ api, t, me, onChanged });
    const [name, login, password] = inputs();
    type(name, 'Lili');
    type(login, 'lea2');
    type(password, 'secret');
    submit();
    await settle();
    expect(bodies(fetch)).toEqual([
      ['/api/me/login', 'PATCH', '{"login":"lea2","password":"secret"}'],
      ['/api/me', 'PATCH', '{"name":"Lili"}'],
    ]);
    expect(onChanged).toHaveBeenCalledWith({ ...me, login: 'lea2', name: 'Lili' });
  });

  it('signale un mauvais mot de passe et laisse la fenêtre ouverte', async () => {
    const { api, fetch } = fakeApi([{ status: 403, body: { error: 'wrong password' } }]);
    const onChanged = vi.fn();
    openAccountDialog({ api, t, me, onChanged });
    const [name, login, password] = inputs();
    type(name, 'Lili');
    type(login, 'lea2');
    type(password, 'faux');
    submit();
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.modal .error')?.textContent).toBe(t.error_password);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('garde un changement réussi quand le suivant échoue, et le transmet à la fermeture', async () => {
    const { api } = fakeApi([
      { status: 200, body: { ...me, login: 'lea2' } },
      { status: 409, body: { error: 'name taken' } },
    ]);
    const onChanged = vi.fn();
    openAccountDialog({ api, t, me, onChanged });
    const [name, login, password] = inputs();
    type(name, 'Pris');
    type(login, 'lea2');
    type(password, 'secret');
    submit();
    await settle();
    expect(document.querySelector('.modal .error')?.textContent).toBe(t.error_nameTaken);
    expect(passwordField()?.hidden).toBe(true);
    const close = [...document.querySelectorAll<HTMLButtonElement>('.modal-buttons button')].find(
      (button) => button.textContent === t.close,
    );
    close?.click();
    expect(onChanged).toHaveBeenCalledWith({ ...me, login: 'lea2' });
  });

  it('ferme sans rien envoyer quand rien ne change', async () => {
    const { api, fetch } = fakeApi([]);
    const onChanged = vi.fn();
    openAccountDialog({ api, t, me, onChanged });
    submit();
    await settle();
    expect(fetch).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
    expect(document.querySelector('.modal')).toBeNull();
  });
});
