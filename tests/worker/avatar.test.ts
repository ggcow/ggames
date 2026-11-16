import { env, runInDurableObject } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { AVATARS, derivedAvatar } from '../../src/shared/platform/avatars.ts';
import type { Account, PlayerInfo } from '../../src/shared/platform/protocol.ts';
import { PlatformStore } from '../../src/worker/platform/store.ts';
import type { World } from '../../src/worker/platform/world.ts';
import { call, newPlayer } from './support.ts';

const world = () => (env.WORLD as DurableObjectNamespace<World>).getByName('main');

/** Les autres tests créent beaucoup de comptes : on libère le catalogue avant chaque cas. */
const freeAllAvatars = () =>
  runInDurableObject(world(), (_instance, state) => {
    state.storage.sql.exec('UPDATE players SET avatar = NULL');
  });

beforeEach(freeAllAvatars);

describe('avatars', () => {
  it('donne un animal du catalogue à l’inscription, différent pour chaque joueur', async () => {
    const a = await newPlayer();
    const b = await newPlayer();
    expect(AVATARS).toContain(a.player.avatar);
    expect(AVATARS).toContain(b.player.avatar);
    expect(a.player.avatar).not.toBe(b.player.avatar);
    expect(a.player.avatar).toBe(derivedAvatar(a.player.id));
  });

  it('change d’animal pour un animal libre', async () => {
    const a = await newPlayer();
    const free = AVATARS.find((avatar) => avatar !== a.player.avatar);
    const changed = await call<Account>('/api/me/avatar', { method: 'PATCH', token: a.token, body: { avatar: free } });
    expect(changed.status).toBe(200);
    expect(changed.body.avatar).toBe(free);
    expect((await call<Account>('/api/me', { token: a.token })).body.avatar).toBe(free);
  });

  it('refuse un animal déjà pris, inconnu ou sans session', async () => {
    const a = await newPlayer();
    const b = await newPlayer();
    const taken = await call('/api/me/avatar', { method: 'PATCH', token: b.token, body: { avatar: a.player.avatar } });
    expect(taken).toEqual({ status: 409, body: { error: 'avatar taken' } });
    const unknown = await call('/api/me/avatar', { method: 'PATCH', token: b.token, body: { avatar: '🚗' } });
    expect(unknown.status).toBe(400);
    const anonymous = await call('/api/me/avatar', { method: 'PATCH', body: { avatar: AVATARS[0] } });
    expect(anonymous.status).toBe(401);
  });

  it('accepte de garder son propre animal', async () => {
    const a = await newPlayer();
    const same = await call<Account>('/api/me/avatar', {
      method: 'PATCH',
      token: a.token,
      body: { avatar: a.player.avatar },
    });
    expect(same.status).toBe(200);
  });

  it('liste les joueurs avec leur animal, réservé aux joueurs connectés', async () => {
    const a = await newPlayer();
    const players = await call<PlayerInfo[]>('/api/players', { token: a.token });
    expect(players.status).toBe(200);
    expect(players.body.find((player) => player.id === a.player.id)?.avatar).toBe(a.player.avatar);
    expect(players.body.every((player) => !('login' in player))).toBe(true);
    expect((await call('/api/players')).status).toBe(401);
  });

  it('attribue un animal libre aux comptes qui n’en ont pas, du plus ancien au plus récent', async () => {
    const a = await newPlayer();
    const b = await newPlayer();
    await runInDurableObject(world(), (_instance, state) => {
      state.storage.sql.exec('UPDATE players SET avatar = NULL');
      // Le plus ancien prend l'animal tiré de l'identifiant du second : celui-ci se rabat sur un autre.
      state.storage.sql.exec('UPDATE players SET avatar = ? WHERE id = ?', derivedAvatar(b.player.id), a.player.id);
      const store = new PlatformStore(state.storage.sql);
      store.assignMissingAvatars();
      const avatars = state.storage.sql
        .exec<{ avatar: string | null }>('SELECT avatar FROM players WHERE avatar IS NOT NULL')
        .toArray()
        .map((row) => row.avatar);
      expect(new Set(avatars).size).toBe(avatars.length);
      expect(store.findPlayer(b.player.id)?.avatar).not.toBe(derivedAvatar(b.player.id));
      expect(store.findPlayer(b.player.id)?.avatar).not.toBeNull();
    });
  });

  it('laisse un joueur sans animal quand le catalogue est épuisé', async () => {
    const fillers = AVATARS.map((avatar, index) => ({ id: `plein${index}x${Date.now()}`, avatar }));
    await runInDurableObject(world(), (_instance, state) => {
      const store = new PlatformStore(state.storage.sql);
      for (const { id, avatar } of fillers) store.insertPlayer({ id, name: id, created: 0, avatar }, id, 'x');
    });
    try {
      const late = await newPlayer();
      expect(late.player.avatar).toBeNull();
    } finally {
      await runInDurableObject(world(), (_instance, state) => {
        for (const { id } of fillers) state.storage.sql.exec('DELETE FROM players WHERE id = ?', id);
      });
    }
  });
});
