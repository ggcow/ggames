// Accès aux données SQLite du Durable Object. Aucune règle métier ici : uniquement des requêtes typées.

import type {
  ContentInfo,
  GameId,
  GameSummary,
  KeyProgress,
  PlayerId,
  PlayerInfo,
  PlayerProgress,
  RecordEntry,
  Run,
  RunSummary,
} from '../../shared/platform/protocol.ts';

export type ScoreOrder = 'asc' | 'desc';

type PlayerRow = { id: string; name: string; created: number };
type ContentRow = { id: string; game: string; data: string; title: string; author: string; created: number };
type CredentialRow = PlayerRow & { password_hash: string };
type RunRow = {
  id: string;
  game: string;
  key: string;
  player: string;
  status: string;
  value: number;
  duration_ms: number;
  ended: number;
};
type RunWithReplayRow = RunRow & { replay: string };
type ProgressRow = { player: string; completed: number; runs: number; play_time: number; last_played: number };
type RecordRow = { key: string; player: string; value: number; run: string };
type KeyRow = { key: string; attempts: number; wins: number; best: string | null };

const RUN_COLUMNS = 'id, game, key, player, status, value, duration_ms, ended';

const toRunSummary = (row: RunRow): RunSummary => ({
  id: row.id,
  game: row.game,
  key: row.key,
  player: row.player,
  status: row.status as RunSummary['status'],
  value: row.value,
  durationMs: row.duration_ms,
  ended: row.ended,
});

const toProgress = (row: ProgressRow): PlayerProgress => ({
  player: row.player,
  completed: row.completed,
  runs: row.runs,
  playTimeMs: row.play_time,
  lastPlayed: row.last_played,
});

/** `ASC`/`DESC` issus d'une valeur fermée : jamais d'entrée utilisateur dans le SQL. */
const sqlOrder = (order: ScoreOrder): 'ASC' | 'DESC' => (order === 'asc' ? 'ASC' : 'DESC');

/** Nom normalisé pour l'unicité (insensible à la casse). */
export const nameKey = (name: string): string => name.toLocaleLowerCase('fr');

export class PlatformStore {
  private readonly sql: SqlStorage;

  constructor(sql: SqlStorage) {
    this.sql = sql;
  }

  /* ---------- Joueurs et sessions ---------- */

  countPlayers(): number {
    return this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM players').one().n;
  }

  isNameTaken(name: string, except?: PlayerId): boolean {
    return (
      this.sql.exec('SELECT 1 FROM players WHERE name_key = ? AND id != ?', nameKey(name), except ?? '').toArray()
        .length > 0
    );
  }

  insertPlayer(player: PlayerInfo, passwordHash: string): void {
    this.sql.exec(
      'INSERT INTO players (id, name, name_key, password_hash, created) VALUES (?, ?, ?, ?, ?)',
      player.id,
      player.name,
      nameKey(player.name),
      passwordHash,
      player.created,
    );
  }

  renamePlayer(id: PlayerId, name: string): void {
    this.sql.exec('UPDATE players SET name = ?, name_key = ? WHERE id = ?', name, nameKey(name), id);
  }

  findCredentials(name: string): { player: PlayerInfo; passwordHash: string } | null {
    const row = this.sql
      .exec<CredentialRow>('SELECT id, name, created, password_hash FROM players WHERE name_key = ?', nameKey(name))
      .toArray()[0];
    return row
      ? { player: { id: row.id, name: row.name, created: row.created }, passwordHash: row.password_hash }
      : null;
  }

  findPlayer(id: string): PlayerInfo | null {
    return this.sql.exec<PlayerRow>('SELECT id, name, created FROM players WHERE id = ?', id).toArray()[0] ?? null;
  }

  listPlayers(): PlayerInfo[] {
    return this.sql.exec<PlayerRow>('SELECT id, name, created FROM players ORDER BY created').toArray();
  }

  insertSession(tokenHash: string, player: PlayerId, now: number): void {
    this.sql.exec(
      'INSERT INTO sessions (token_hash, player, created, last_used) VALUES (?, ?, ?, ?)',
      tokenHash,
      player,
      now,
      now,
    );
  }

  /** Joueur d'une session, en mettant à jour sa date d'utilisation. */
  useSession(tokenHash: string, now: number): PlayerInfo | null {
    const row = this.sql
      .exec<PlayerRow>(
        'SELECT p.id, p.name, p.created FROM sessions s JOIN players p ON p.id = s.player WHERE s.token_hash = ?',
        tokenHash,
      )
      .toArray()[0];
    if (row) this.sql.exec('UPDATE sessions SET last_used = ? WHERE token_hash = ?', now, tokenHash);
    return row ?? null;
  }

  deleteSession(tokenHash: string): void {
    this.sql.exec('DELETE FROM sessions WHERE token_hash = ?', tokenHash);
  }

  /* ---------- Contenus ---------- */

  countContents(game: GameId): number {
    return this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM contents WHERE game = ?', game).one().n;
  }

  findContent(game: GameId, id: string): ContentInfo | null {
    return (
      this.sql
        .exec<ContentRow>(
          'SELECT id, game, data, title, author, created FROM contents WHERE game = ? AND id = ?',
          game,
          id,
        )
        .toArray()[0] ?? null
    );
  }

  findContentByData(game: GameId, data: string): ContentInfo | null {
    return (
      this.sql
        .exec<ContentRow>(
          'SELECT id, game, data, title, author, created FROM contents WHERE game = ? AND data = ?',
          game,
          data,
        )
        .toArray()[0] ?? null
    );
  }

  listContents(game: GameId): ContentInfo[] {
    return this.sql
      .exec<ContentRow>(
        'SELECT id, game, data, title, author, created FROM contents WHERE game = ? ORDER BY created DESC',
        game,
      )
      .toArray();
  }

  insertContent(content: ContentInfo): void {
    this.sql.exec(
      'INSERT INTO contents (id, game, data, title, author, created) VALUES (?, ?, ?, ?, ?, ?)',
      content.id,
      content.game,
      content.data,
      content.title,
      content.author,
      content.created,
    );
  }

  /** Supprime un contenu et toutes les parties jouées dessus. */
  deleteContent(game: GameId, id: string, key: string): void {
    this.sql.exec('DELETE FROM runs WHERE game = ? AND key = ?', game, key);
    this.sql.exec('DELETE FROM contents WHERE game = ? AND id = ?', game, id);
  }

  /* ---------- Parties ---------- */

  insertRun(run: Run): void {
    this.sql.exec(
      'INSERT INTO runs (id, game, key, player, status, value, duration_ms, replay, ended) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      run.id,
      run.game,
      run.key,
      run.player,
      run.status,
      run.value,
      run.durationMs,
      run.replay,
      run.ended,
    );
  }

  findRun(id: string): Run | null {
    const row = this.sql
      .exec<RunWithReplayRow>(`SELECT ${RUN_COLUMNS}, replay FROM runs WHERE id = ?`, id)
      .toArray()[0];
    return row ? { ...toRunSummary(row), replay: row.replay } : null;
  }

  findRunSummary(id: string): RunSummary | null {
    const row = this.sql.exec<RunRow>(`SELECT ${RUN_COLUMNS} FROM runs WHERE id = ?`, id).toArray()[0];
    return row ? toRunSummary(row) : null;
  }

  recentRuns(game: GameId, player: PlayerId, limit: number): RunSummary[] {
    return this.sql
      .exec<RunRow>(
        `SELECT ${RUN_COLUMNS} FROM runs WHERE game = ? AND player = ? ORDER BY ended DESC LIMIT ?`,
        game,
        player,
        limit,
      )
      .toArray()
      .map(toRunSummary);
  }

  /** Meilleure partie gagnée de chaque joueur, pour chaque clé (ou une seule clé). */
  records(game: GameId, order: ScoreOrder, key?: string): Record<string, RecordEntry[]> {
    const dir = sqlOrder(order);
    const rows = this.sql.exec<RecordRow>(
      `SELECT key, player, value, id AS run FROM (
         SELECT key, player, value, id, ended,
                ROW_NUMBER() OVER (PARTITION BY key, player ORDER BY value ${dir}, ended) AS rank
         FROM runs WHERE game = ? AND status = 'won' AND (? IS NULL OR key = ?)
       ) WHERE rank = 1 ORDER BY key, value ${dir}, ended`,
      game,
      key ?? null,
      key ?? null,
    );
    const records: Record<string, RecordEntry[]> = {};
    for (const row of rows) {
      const entries = records[row.key] ?? [];
      entries.push({ player: row.player, value: row.value, run: row.run });
      records[row.key] = entries;
    }
    return records;
  }

  progress(game: GameId, player?: PlayerId): PlayerProgress[] {
    return this.sql
      .exec<ProgressRow>(
        `SELECT player,
                COUNT(DISTINCT CASE WHEN status = 'won' THEN key END) AS completed,
                COUNT(*) AS runs,
                SUM(duration_ms) AS play_time,
                MAX(ended) AS last_played
         FROM runs WHERE game = ? AND (? IS NULL OR player = ?)
         GROUP BY player ORDER BY completed DESC, last_played DESC`,
        game,
        player ?? null,
        player ?? null,
      )
      .toArray()
      .map(toProgress);
  }

  keyProgress(game: GameId, player: PlayerId, order: ScoreOrder): KeyProgress[] {
    const dir = sqlOrder(order);
    const rows = this.sql
      .exec<KeyRow>(
        `SELECT key, COUNT(*) AS attempts, SUM(status = 'won') AS wins,
                (SELECT id FROM runs b WHERE b.game = r.game AND b.player = r.player AND b.key = r.key
                   AND b.status = 'won' ORDER BY b.value ${dir}, b.ended LIMIT 1) AS best
         FROM runs r WHERE game = ? AND player = ? GROUP BY key ORDER BY MAX(ended) DESC`,
        game,
        player,
      )
      .toArray();
    return rows.map((row) => ({
      key: row.key,
      attempts: row.attempts,
      wins: row.wins,
      best: row.best ? this.findRunSummary(row.best) : null,
    }));
  }

  gameSummaries(): Map<GameId, Omit<GameSummary, 'id'>> {
    const rows = this.sql.exec<{ game: string; players: number; runs: number; last_played: number }>(
      'SELECT game, COUNT(DISTINCT player) AS players, COUNT(*) AS runs, MAX(ended) AS last_played FROM runs GROUP BY game',
    );
    const summaries = new Map<GameId, Omit<GameSummary, 'id'>>();
    for (const row of rows) {
      summaries.set(row.game, { players: row.players, runs: row.runs, lastPlayed: row.last_played });
    }
    return summaries;
  }
}
