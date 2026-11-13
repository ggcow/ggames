// Schéma SQLite du Durable Object World, appliqué par étapes numérotées.
// Faire évoluer le schéma : ajouter une étape à la fin de MIGRATIONS. Ne jamais modifier une étape
// existante : elle a déjà été appliquée sur les données de production.

const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE players (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created INTEGER NOT NULL
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    player TEXT NOT NULL REFERENCES players(id),
    created INTEGER NOT NULL,
    last_used INTEGER NOT NULL
  );
  CREATE INDEX sessions_player ON sessions (player);
  CREATE TABLE contents (
    id TEXT PRIMARY KEY,
    game TEXT NOT NULL,
    data TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT NOT NULL REFERENCES players(id),
    created INTEGER NOT NULL,
    UNIQUE (game, data)
  );
  CREATE TABLE runs (
    id TEXT PRIMARY KEY,
    game TEXT NOT NULL,
    key TEXT NOT NULL,
    player TEXT NOT NULL REFERENCES players(id),
    status TEXT NOT NULL CHECK (status IN ('won', 'lost', 'abandoned')),
    value INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    replay TEXT NOT NULL,
    ended INTEGER NOT NULL
  );
  CREATE INDEX runs_game_key ON runs (game, key, status, value);
  CREATE INDEX runs_game_player ON runs (game, player, ended);
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export function migrate(sql: SqlStorage): void {
  sql.exec(
    'CREATE TABLE IF NOT EXISTS schema_version (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL)',
  );
  const current = sql.exec<{ version: number }>('SELECT version FROM schema_version').toArray()[0]?.version ?? 0;
  MIGRATIONS.slice(current).forEach((step, index) => {
    sql.exec(step);
    sql.exec(
      'INSERT INTO schema_version (id, version) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET version = excluded.version',
      current + index + 1,
    );
  });
}
