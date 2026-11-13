import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { migrate, SCHEMA_VERSION } from '../../src/worker/platform/schema.ts';
import type { World } from '../../src/worker/platform/world.ts';

const world = () => (env.WORLD as DurableObjectNamespace<World>).getByName('main');

const tables = (sql: SqlStorage) =>
  sql
    .exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .toArray()
    .map((row) => row.name);

describe('schéma', () => {
  it('applique toutes les migrations au démarrage', async () => {
    await runInDurableObject(world(), (_instance, state) => {
      const { sql } = state.storage;
      expect(tables(sql)).toEqual(['players', 'runs', 'schema_version', 'sessions']);
      expect(sql.exec<{ version: number }>('SELECT version FROM schema_version').one().version).toBe(SCHEMA_VERSION);
    });
  });

  it('ne réapplique rien quand le schéma est à jour', async () => {
    await runInDurableObject(world(), (_instance, state) => {
      const before = tables(state.storage.sql);
      migrate(state.storage.sql);
      expect(tables(state.storage.sql)).toEqual(before);
    });
  });

  it('remet à zéro les parties Fioles en passant à la version 3 (nouvelle campagne)', async () => {
    await runInDurableObject(world(), (_instance, state) => {
      const { sql } = state.storage;
      sql.exec("INSERT INTO players (id, name, name_key, password_hash, created) VALUES ('abc123', 'A', 'a', 'x', 1)");
      sql.exec(
        "INSERT INTO runs (id, game, key, player, status, value, duration_ms, replay, ended) VALUES ('run001', 'fioles', 'c:1', 'abc123', 'won', 5, 1, '', 1)",
      );
      sql.exec('UPDATE schema_version SET version = 2');
      migrate(sql);
      expect(sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM runs').one().n).toBe(0);
      expect(sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM players').one().n).toBe(1);
      expect(sql.exec<{ version: number }>('SELECT version FROM schema_version').one().version).toBe(SCHEMA_VERSION);
    });
  });
});
