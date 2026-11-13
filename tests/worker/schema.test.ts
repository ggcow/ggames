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
});
