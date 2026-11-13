import { describe, expect, it } from 'vitest';
import type { PlayerInfo, SessionResponse } from '../../src/shared/platform/protocol.ts';
import { call, newPlayer } from './support.ts';

describe('comptes', () => {
  it('crée un compte et renvoie une session utilisable', async () => {
    const { status, body } = await call<SessionResponse>('/api/auth/register', {
      body: { name: '  Léa  ', password: 'motdepasse' },
    });
    expect(status).toBe(200);
    expect(body.player.name).toBe('Léa');
    expect(body.token).toMatch(/^[0-9a-f]{48}$/);
    const me = await call<PlayerInfo>('/api/me', { token: body.token });
    expect(me.body).toEqual(body.player);
  });

  it('refuse un nom déjà pris, sans tenir compte de la casse', async () => {
    await call('/api/auth/register', { body: { name: 'Tom', password: 'abcd' } });
    const { status } = await call('/api/auth/register', { body: { name: 'tom', password: 'abcd' } });
    expect(status).toBe(409);
  });

  it.each([[{ name: '', password: 'abcd' }], [{ name: 'Ana', password: 'abc' }], [{ name: 'Ana', password: 42 }]])(
    'refuse une inscription invalide %j',
    async (body) => {
      expect((await call('/api/auth/register', { body })).status).toBe(400);
    },
  );

  it('connecte avec le bon mot de passe, depuis plusieurs appareils', async () => {
    await call('/api/auth/register', { body: { name: '小明', password: 'mot-de-passe' } });
    const first = await call<SessionResponse>('/api/auth/login', { body: { name: '小明', password: 'mot-de-passe' } });
    const second = await call<SessionResponse>('/api/auth/login', { body: { name: '小明', password: 'mot-de-passe' } });
    expect(first.status).toBe(200);
    expect(second.body.token).not.toBe(first.body.token);
    expect((await call('/api/me', { token: first.body.token })).status).toBe(200);
  });

  it('refuse un mauvais mot de passe puis bloque après 10 échecs', async () => {
    await call('/api/auth/register', { body: { name: 'Max', password: 'correct' } });
    for (let i = 0; i < 10; i++) {
      expect((await call('/api/auth/login', { body: { name: 'Max', password: 'faux' } })).status).toBe(401);
    }
    expect((await call('/api/auth/login', { body: { name: 'Max', password: 'correct' } })).status).toBe(429);
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

  it('répond 404 aux routes inconnues et 400 aux corps invalides', async () => {
    expect((await call('/api/nope')).status).toBe(404);
    const { exports } = await import('cloudflare:workers');
    const response = await exports.default.fetch(
      new Request('https://test.local/api/auth/login', { method: 'POST', body: 'pas du json' }),
    );
    expect(response.status).toBe(400);
  });
});
