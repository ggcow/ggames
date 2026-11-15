import { describe, expect, it } from 'vitest';
import type {
  Account,
  ErrorResponse,
  GameState,
  PlayerInfo,
  SessionResponse,
} from '../../src/shared/platform/protocol.ts';
import { call, newPlayer } from './support.ts';

describe('comptes', () => {
  it('crée un compte et renvoie une session utilisable', async () => {
    const { status, body } = await call<SessionResponse>('/api/auth/register', {
      body: { login: '  Léa  ', password: 'motdepasse' },
    });
    expect(status).toBe(200);
    expect(body.player).toMatchObject({ name: 'Léa', login: 'Léa' });
    expect(body.token).toMatch(/^[0-9a-f]{48}$/);
    const me = await call<Account>('/api/me', { token: body.token });
    expect(me.body).toEqual(body.player);
  });

  it('refuse un nom déjà pris, sans tenir compte de la casse', async () => {
    await call('/api/auth/register', { body: { login: 'Tom', password: 'abcd' } });
    const { status } = await call('/api/auth/register', { body: { login: 'tom', password: 'abcd' } });
    expect(status).toBe(409);
  });

  it.each([
    [{ login: '', password: 'abcd' }],
    [{ login: 'Ana', password: 'abc' }],
    [{ login: 'Ana', password: 42 }],
    [{ name: 'Ana', password: 'abcd' }],
  ])('refuse une inscription invalide %j', async (body) => {
    expect((await call('/api/auth/register', { body })).status).toBe(400);
  });

  it('connecte avec le bon mot de passe, depuis plusieurs appareils', async () => {
    await call('/api/auth/register', { body: { login: '小明', password: 'mot-de-passe' } });
    const first = await call<SessionResponse>('/api/auth/login', { body: { login: '小明', password: 'mot-de-passe' } });
    const second = await call<SessionResponse>('/api/auth/login', {
      body: { login: '小明', password: 'mot-de-passe' },
    });
    expect(first.status).toBe(200);
    expect(second.body.token).not.toBe(first.body.token);
    expect((await call('/api/me', { token: first.body.token })).status).toBe(200);
  });

  it('refuse un mauvais mot de passe puis bloque après 10 échecs', async () => {
    await call('/api/auth/register', { body: { login: 'Max', password: 'correct' } });
    for (let i = 0; i < 10; i++) {
      expect((await call('/api/auth/login', { body: { login: 'Max', password: 'faux' } })).status).toBe(401);
    }
    expect((await call('/api/auth/login', { body: { login: 'Max', password: 'correct' } })).status).toBe(429);
  });

  it('déconnecte : le jeton ne fonctionne plus', async () => {
    const { token } = await newPlayer();
    await call('/api/auth/logout', { method: 'POST', token });
    expect((await call('/api/me', { token })).status).toBe(401);
  });

  it('exige une session pour les données', async () => {
    expect((await call('/api/me')).status).toBe(401);
    expect((await call('/api/games')).status).toBe(401);
    expect((await call('/api/me', { token: 'x'.repeat(48) })).status).toBe(401);
  });

  it('renomme et refuse un nom pris', async () => {
    const a = await newPlayer();
    const b = await newPlayer();
    const renamed = await call<PlayerInfo>('/api/me', { method: 'PATCH', token: a.token, body: { name: 'Nouveau' } });
    expect(renamed.body.name).toBe('Nouveau');
    const clash = await call('/api/me', { method: 'PATCH', token: b.token, body: { name: 'NOUVEAU' } });
    expect(clash.status).toBe(409);
  });

  it('garde l’identifiant de connexion quand le pseudo change', async () => {
    await call('/api/auth/register', { body: { login: 'Zoé', password: 'secret' } });
    const session = await call<SessionResponse>('/api/auth/login', { body: { login: 'zoé', password: 'secret' } });
    expect(session.body.player.name).toBe('Zoé');
    await call('/api/me', { method: 'PATCH', token: session.body.token, body: { name: 'Zozo' } });

    const again = await call<SessionResponse>('/api/auth/login', { body: { login: 'Zoé', password: 'secret' } });
    expect(again.status).toBe(200);
    expect(again.body.player).toEqual({ ...session.body.player, name: 'Zozo' });
    expect((await call('/api/auth/login', { body: { login: 'Zozo', password: 'secret' } })).status).toBe(401);
  });

  it('réserve l’identifiant d’un joueur renommé et le pseudo affiché d’un autre', async () => {
    const renamed = await call<SessionResponse>('/api/auth/register', { body: { login: 'Paul', password: 'abcd' } });
    await call('/api/me', { method: 'PATCH', token: renamed.body.token, body: { name: 'Polo' } });
    const register = (login: string) =>
      call<ErrorResponse>('/api/auth/register', { body: { login, password: 'abcd' } });

    const login = await register('PAUL');
    expect(login.status).toBe(409);
    expect(login.body.error).toBe('login taken');
    const name = await register('polo');
    expect(name.status).toBe(409);
    expect(name.body.error).toBe('name taken');
  });

  it('laisse prendre comme pseudo l’identifiant d’un autre joueur renommé', async () => {
    const ines = await call<SessionResponse>('/api/auth/register', { body: { login: 'Inès', password: 'abcd' } });
    const other = await newPlayer();
    const rename = (token: string, name: string) =>
      call<PlayerInfo>('/api/me', { method: 'PATCH', token, body: { name } });
    expect((await rename(other.token, 'Inès')).status).toBe(409);
    await rename(ines.body.token, 'Nana');
    const renamed = await rename(other.token, 'Inès');
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe('Inès');
    const login = await call<SessionResponse>('/api/auth/login', { body: { login: 'inès', password: 'abcd' } });
    expect(login.body.player).toEqual({ ...ines.body.player, name: 'Nana' });
  });

  describe('changement d’identifiant', () => {
    const changeLogin = (token: string, body: unknown) =>
      call<Account & ErrorResponse>('/api/me/login', { method: 'PATCH', token, body });

    it('change l’identifiant sans toucher au pseudo', async () => {
      const { token, player } = await call<SessionResponse>('/api/auth/register', {
        body: { login: 'Hugo', password: 'secret' },
      }).then((r) => r.body);
      const changed = await changeLogin(token, { login: '  Hugo2  ', password: 'secret' });
      expect(changed.status).toBe(200);
      expect(changed.body).toEqual({ ...player, login: 'Hugo2' });
      expect((await call<Account>('/api/me', { token })).body.login).toBe('Hugo2');

      expect((await call('/api/auth/login', { body: { login: 'Hugo', password: 'secret' } })).status).toBe(401);
      const again = await call<SessionResponse>('/api/auth/login', { body: { login: 'hugo2', password: 'secret' } });
      expect(again.body.player).toEqual({ ...player, login: 'Hugo2' });
    });

    it('accepte de changer seulement la casse de son identifiant', async () => {
      const { token } = await call<SessionResponse>('/api/auth/register', {
        body: { login: 'clara', password: 'secret' },
      }).then((r) => r.body);
      expect((await changeLogin(token, { login: 'Clara', password: 'secret' })).body.login).toBe('Clara');
    });

    it('exige le bon mot de passe et compte les échecs comme à la connexion', async () => {
      const { token } = await call<SessionResponse>('/api/auth/register', {
        body: { login: 'Rémi', password: 'secret' },
      }).then((r) => r.body);
      const wrong = await changeLogin(token, { login: 'Rémi2', password: 'faux' });
      expect(wrong.status).toBe(403);
      expect(wrong.body.error).toBe('wrong password');
      for (let i = 1; i < 10; i++)
        expect((await changeLogin(token, { login: 'Rémi2', password: 'faux' })).status).toBe(403);
      expect((await changeLogin(token, { login: 'Rémi2', password: 'secret' })).status).toBe(429);
      expect((await call('/api/auth/login', { body: { login: 'Rémi', password: 'secret' } })).status).toBe(429);
      expect((await call<Account>('/api/me', { token })).body.login).toBe('Rémi');
    });

    it('refuse un identifiant pris, invalide, ou sans session', async () => {
      await call('/api/auth/register', { body: { login: 'Yanis', password: 'abcd' } });
      const { token } = await newPlayer();
      const taken = await changeLogin(token, { login: 'YANIS', password: 'secret123' });
      expect(taken.status).toBe(409);
      expect(taken.body.error).toBe('login taken');
      expect((await changeLogin(token, { login: '  ', password: 'secret123' })).status).toBe(400);
      expect((await changeLogin(token, { login: 'Yaya' })).status).toBe(400);
      const anonymous = await call('/api/me/login', { method: 'PATCH', body: { login: 'Yaya', password: 'x' } });
      expect(anonymous.status).toBe(401);
    });

    it('ne montre jamais l’identifiant aux autres joueurs', async () => {
      const me = await newPlayer();
      await changeLogin(me.token, { login: 'secret-login', password: 'secret123' });
      const other = await newPlayer();
      const state = await call<GameState>('/api/games/fioles', { token: other.token });
      expect(JSON.stringify(state.body)).not.toContain('secret-login');
      expect(state.body.players.find((p) => p.id === me.player.id)).toEqual({
        id: me.player.id,
        name: me.player.name,
        created: me.player.created,
      });
    });
  });

  it('répond 404 aux routes inconnues et 400 aux corps invalides', async () => {
    expect((await call('/api/nope')).status).toBe(404);
    const { exports } = await import('cloudflare:workers');
    const response = await exports.default.fetch(
      new Request('https://test.local/api/auth/login', { method: 'POST', body: 'pas du json' }),
    );
    expect(response.status).toBe(400);
  });
});
