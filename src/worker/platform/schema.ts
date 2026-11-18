// Schéma SQLite du Durable Object World, appliqué par étapes numérotées.
// Faire évoluer le schéma : ajouter une étape à la fin de MIGRATIONS. Ne jamais modifier une étape
// existante : elle a déjà été appliquée sur les données de production. Les étapes forment donc un
// journal ; le schéma courant est le résultat de toutes les étapes.

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
  `
  DROP TABLE contents;
  DELETE FROM runs WHERE game = 'fioles' AND key LIKE 'l:%';
  `,
  `
  DELETE FROM runs WHERE game = 'fioles';
  `,
  `
  CREATE TABLE chat_messages (
    id TEXT PRIMARY KEY,
    player TEXT NOT NULL REFERENCES players(id),
    text TEXT NOT NULL,
    created INTEGER NOT NULL
  );
  CREATE INDEX chat_messages_created ON chat_messages (created);
  `,
  `
  CREATE TABLE voice_notes (
    id TEXT PRIMARY KEY,
    player TEXT NOT NULL REFERENCES players(id),
    duration_ms INTEGER NOT NULL,
    mime TEXT NOT NULL,
    data BLOB NOT NULL,
    created INTEGER NOT NULL
  );
  CREATE INDEX voice_notes_created ON voice_notes (created);
  CREATE TABLE voice_reads (
    note TEXT NOT NULL REFERENCES voice_notes(id) ON DELETE CASCADE,
    player TEXT NOT NULL REFERENCES players(id),
    read_at INTEGER NOT NULL,
    PRIMARY KEY (note, player)
  );
  CREATE INDEX voice_reads_player ON voice_reads (player);
  `,
  `
  DROP TABLE voice_reads;
  CREATE TABLE race_voices (
    id TEXT PRIMARY KEY,
    game TEXT NOT NULL,
    key TEXT NOT NULL,
    player TEXT NOT NULL REFERENCES players(id),
    duration_ms INTEGER NOT NULL,
    mime TEXT NOT NULL,
    data BLOB NOT NULL,
    created INTEGER NOT NULL
  );
  CREATE INDEX race_voices_key ON race_voices (game, key, created);
  CREATE TABLE race_voice_recipients (
    note TEXT NOT NULL REFERENCES race_voices(id) ON DELETE CASCADE,
    player TEXT NOT NULL REFERENCES players(id),
    PRIMARY KEY (note, player)
  );
  CREATE INDEX race_voice_recipients_player ON race_voice_recipients (player);
  CREATE TABLE race_voice_reads (
    note TEXT NOT NULL REFERENCES race_voices(id) ON DELETE CASCADE,
    player TEXT NOT NULL REFERENCES players(id),
    read_at INTEGER NOT NULL,
    PRIMARY KEY (note, player)
  );
  CREATE INDEX race_voice_reads_player ON race_voice_reads (player);
  `,
  `
  DELETE FROM runs WHERE game = 'fioles' AND key IN (
    'c:24', 'c:34', 'c:35', 'c:38', 'c:41', 'c:42', 'c:46', 'c:47', 'c:50', 'c:51', 'c:54',
    'c:56', 'c:57', 'c:59', 'c:60', 'c:65', 'c:66', 'c:68', 'c:70', 'c:72', 'c:73', 'c:75',
    'c:79', 'c:80', 'c:82', 'c:83', 'c:84', 'c:89', 'c:91', 'c:92', 'c:94', 'c:95', 'c:100'
  );
  `,
  // Une annulation retire un coup au lieu d'en ajouter un : score = coups - annulations, relu dans le replay.
  // Une annulation s'y écrit « u » ; un coup y prend 2 caractères pour Fioles, 4 pour Bouquets.
  `
  UPDATE runs SET value = (length(replay) - 3 * (length(replay) - length(replace(replay, 'u', '')))) / 2
    WHERE game = 'fioles';
  UPDATE runs SET value = (length(replay) - 5 * (length(replay) - length(replace(replay, 'u', '')))) / 4
    WHERE game = 'bouquets';
  `,
  // L'identifiant de connexion se sépare du pseudo affiché. La clé unique existante devient celle de
  // l'identifiant, qui ne change plus ; le pseudo reçoit sa propre clé, toujours unique sans casse.
  `
  ALTER TABLE players RENAME COLUMN name_key TO login_key;
  ALTER TABLE players ADD COLUMN name_key TEXT NOT NULL DEFAULT '';
  UPDATE players SET name_key = login_key;
  CREATE UNIQUE INDEX players_name_key ON players (name_key);
  `,
  // L'identifiant devient modifiable et s'affiche à son propriétaire tel qu'il l'a écrit. Sans
  // renommage possible entre l'étape précédente et celle-ci, il vaut encore le pseudo de chaque compte.
  `
  ALTER TABLE players ADD COLUMN login TEXT NOT NULL DEFAULT '';
  UPDATE players SET login = name;
  `,
  // Chaque joueur a son animal, que personne d'autre n'a. Les comptes existants le reçoivent au démarrage
  // du Durable Object (assignMissingAvatars), le choix dépendant du catalogue côté code.
  `
  ALTER TABLE players ADD COLUMN avatar TEXT;
  CREATE UNIQUE INDEX players_avatar ON players (avatar);
  `,
  // Les 100 niveaux de Parking sont regénérés, plus difficiles : les parties jouées sur les plateaux
  // précédents ne se rejouent plus.
  `
  DELETE FROM runs WHERE game = 'parking';
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
