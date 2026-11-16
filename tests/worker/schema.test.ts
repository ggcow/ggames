import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { bouquets, encodeActions as encodeBouquets } from '../../src/shared/games/bouquets/definition.ts';
import { encodeActions as encodeFioles, type FiolesAction, fioles } from '../../src/shared/games/fioles/definition.ts';
import { migrate, SCHEMA_VERSION } from '../../src/worker/platform/schema.ts';
import type { World } from '../../src/worker/platform/world.ts';
import { bouquetsWin } from '../support/bouquets.ts';
import { fiolesLevel, solve } from '../support/fioles-solver.ts';

const world = () => (env.WORLD as DurableObjectNamespace<World>).getByName('main');

/** Remet la table `players` dans son état d'avant l'animal de chaque joueur. */
const rewindAvatar = (sql: SqlStorage) => {
  sql.exec('DROP INDEX players_avatar');
  sql.exec('ALTER TABLE players DROP COLUMN avatar');
};

/** Remet la table `players` dans son état d'avant l'identifiant modifiable. */
const rewindLoginColumn = (sql: SqlStorage) => {
  rewindAvatar(sql);
  sql.exec('ALTER TABLE players DROP COLUMN login');
};

/** Remet la table `players` dans son état d'avant la séparation de l'identifiant et du pseudo. */
const rewindLoginSplit = (sql: SqlStorage) => {
  rewindLoginColumn(sql);
  sql.exec('DROP INDEX players_name_key');
  sql.exec('ALTER TABLE players DROP COLUMN name_key');
  sql.exec('ALTER TABLE players RENAME COLUMN login_key TO name_key');
};

const tables = (sql: SqlStorage) =>
  sql
    .exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .toArray()
    .map((row) => row.name);

describe('schéma', () => {
  it('applique toutes les migrations au démarrage', async () => {
    await runInDurableObject(world(), (_instance, state) => {
      const { sql } = state.storage;
      expect(tables(sql)).toEqual([
        'chat_messages',
        'players',
        'race_voice_reads',
        'race_voice_recipients',
        'race_voices',
        'runs',
        'schema_version',
        'sessions',
        'voice_notes',
      ]);
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

  it('remet à zéro les parties Fioles en repassant par les migrations', async () => {
    await runInDurableObject(world(), (_instance, state) => {
      const { sql } = state.storage;
      rewindLoginSplit(sql);
      sql.exec("INSERT INTO players (id, name, name_key, password_hash, created) VALUES ('abc123', 'A', 'a', 'x', 1)");
      sql.exec(
        "INSERT INTO runs (id, game, key, player, status, value, duration_ms, replay, ended) VALUES ('run001', 'fioles', 'c:1', 'abc123', 'won', 5, 1, '', 1)",
      );
      sql.exec('DROP TABLE race_voice_reads');
      sql.exec('DROP TABLE race_voice_recipients');
      sql.exec('DROP TABLE race_voices');
      sql.exec('DROP TABLE voice_notes');
      sql.exec('DROP TABLE chat_messages');
      sql.exec('UPDATE schema_version SET version = 2');
      migrate(sql);
      expect(sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM runs').one().n).toBe(0);
      expect(sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM players').one().n).toBe(1);
      expect(sql.exec<{ version: number }>('SELECT version FROM schema_version').one().version).toBe(SCHEMA_VERSION);
    });
  });

  it('supprime seulement les parties des niveaux de Fioles remplacés', async () => {
    await runInDurableObject(world(), (_instance, state) => {
      const { sql } = state.storage;
      rewindLoginSplit(sql);
      sql.exec("INSERT INTO players (id, name, name_key, password_hash, created) VALUES ('def456', 'B', 'b', 'x', 1)");
      const insert = (id: string, game: string, key: string) =>
        sql.exec(
          "INSERT INTO runs (id, game, key, player, status, value, duration_ms, replay, ended) VALUES (?, ?, ?, 'def456', 'won', 5, 1, '', 1)",
          id,
          game,
          key,
        );
      insert('run101', 'fioles', 'c:24');
      insert('run102', 'fioles', 'c:100');
      insert('run103', 'fioles', 'c:23');
      insert('run104', 'autre', 'c:24');
      sql.exec('UPDATE schema_version SET version = 6');
      migrate(sql);
      const left = sql.exec<{ id: string }>('SELECT id FROM runs ORDER BY id').toArray();
      expect(left.map((row) => row.id)).toEqual(['run103', 'run104']);
    });
  });

  it('recalcule le score des parties : une annulation retire un coup', async () => {
    const fiolesWin = solve(fiolesLevel(1)) ?? [];
    const [pour] = fiolesWin;
    const [move, ...rest] = bouquetsWin(1);
    if (!pour || !move) throw new Error('premiers coups attendus');
    const fiolesReplay = encodeFioles([pour, { type: 'undo' } satisfies FiolesAction, ...fiolesWin]);
    const bouquetsReplay = encodeBouquets([move, { type: 'undo' }, move, ...rest]);
    await runInDurableObject(world(), (_instance, state) => {
      const { sql } = state.storage;
      rewindLoginSplit(sql);
      sql.exec("INSERT INTO players (id, name, name_key, password_hash, created) VALUES ('ghi789', 'C', 'c', 'x', 1)");
      const insert = (id: string, game: string, replay: string) =>
        sql.exec(
          "INSERT INTO runs (id, game, key, player, status, value, duration_ms, replay, ended) VALUES (?, ?, 'c:1', 'ghi789', 'won', 999, 1, ?, 1)",
          id,
          game,
          replay,
        );
      insert('run201', 'fioles', fiolesReplay);
      insert('run202', 'bouquets', bouquetsReplay);
      insert('run203', 'autre', 'u');
      sql.exec('UPDATE schema_version SET version = 7');
      migrate(sql);
      const value = (id: string) => sql.exec<{ value: number }>('SELECT value FROM runs WHERE id = ?', id).one().value;
      expect(value('run201')).toBe(fioles.replay('c:1', fiolesReplay)?.value);
      expect(value('run201')).toBe(fiolesWin.length);
      expect(value('run202')).toBe(bouquets.replay('c:1', bouquetsReplay)?.value);
      expect(value('run202')).toBe(rest.length + 1);
      expect(value('run203')).toBe(999);
    });
  });

  it('sépare l’identifiant du pseudo sans toucher aux comptes existants', async () => {
    await runInDurableObject(world(), (_instance, state) => {
      const { sql } = state.storage;
      rewindLoginSplit(sql);
      sql.exec(
        "INSERT INTO players (id, name, name_key, password_hash, created) VALUES ('jkl012', 'Léa', 'léa', 'x', 1)",
      );
      sql.exec('UPDATE schema_version SET version = 8');
      migrate(sql);
      const row = sql
        .exec<{ name: string; name_key: string; login_key: string }>(
          "SELECT name, name_key, login_key FROM players WHERE id = 'jkl012'",
        )
        .one();
      expect(row).toEqual({ name: 'Léa', name_key: 'léa', login_key: 'léa' });
      expect(() =>
        sql.exec(
          "INSERT INTO players (id, name, name_key, login_key, password_hash, created) VALUES ('mno345', 'LÉA', 'léa', 'autre', 'x', 1)",
        ),
      ).toThrow(/UNIQUE/);
    });
  });

  it('donne à chaque compte existant son pseudo comme identifiant affiché', async () => {
    await runInDurableObject(world(), (_instance, state) => {
      const { sql } = state.storage;
      rewindLoginColumn(sql);
      sql.exec(
        "INSERT INTO players (id, name, name_key, login_key, password_hash, created) VALUES ('pqr678', 'Noé', 'noé', 'noé', 'x', 1)",
      );
      sql.exec('UPDATE schema_version SET version = 9');
      migrate(sql);
      expect(sql.exec<{ login: string }>("SELECT login FROM players WHERE id = 'pqr678'").one().login).toBe('Noé');
    });
  });

  it('ajoute l’animal des joueurs, vide pour les comptes existants et unique', async () => {
    await runInDurableObject(world(), (_instance, state) => {
      const { sql } = state.storage;
      rewindAvatar(sql);
      sql.exec(
        `INSERT INTO players (id, name, name_key, login, login_key, password_hash, created)
         VALUES ('mno345', 'Zoé', 'zoé', 'zoe', 'zoe', 'x', 1), ('pqr678', 'Max', 'max', 'max', 'max', 'x', 2)`,
      );
      sql.exec('UPDATE schema_version SET version = ?', SCHEMA_VERSION - 1);
      migrate(sql);
      const avatar = sql.exec<{ avatar: string | null }>("SELECT avatar FROM players WHERE id = 'mno345'").one();
      expect(avatar.avatar).toBeNull();
      sql.exec("UPDATE players SET avatar = '🐶' WHERE id = 'mno345'");
      expect(() => sql.exec("UPDATE players SET avatar = '🐶' WHERE id = 'pqr678'")).toThrow();
      sql.exec("DELETE FROM players WHERE id IN ('mno345', 'pqr678')");
    });
  });
});
