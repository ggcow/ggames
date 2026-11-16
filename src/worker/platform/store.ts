// Accès aux données SQLite du Durable Object. Aucune règle métier ici : uniquement des requêtes typées.

import type { ScoreOrder } from '../../shared/games/game.ts';
import { type Avatar, isAvatar, pickAvatar } from '../../shared/platform/avatars.ts';
import type {
  Account,
  ChatMessage,
  GameId,
  GameSummary,
  KeyProgress,
  PlayerId,
  PlayerInfo,
  PlayerProgress,
  RaceVoice,
  RecordEntry,
  Run,
  RunSummary,
  VoiceNote,
} from '../../shared/platform/protocol.ts';

/** Avancement d'un joueur sur une clé, avant de savoir qui le regarde et son rang. */
export type StoredKeyProgress = Omit<KeyProgress, 'replayVisible' | 'rank'>;

type PlayerRow = { id: string; name: string; created: number; avatar: string | null };
type AccountRow = PlayerRow & { login: string };
type CredentialRow = AccountRow & { password_hash: string };

const PLAYER_COLUMNS = 'id, name, created, avatar';

const toPlayer = (row: PlayerRow): PlayerInfo => ({
  id: row.id,
  name: row.name,
  created: row.created,
  avatar: isAvatar(row.avatar) ? row.avatar : null,
});

const toAccount = (row: AccountRow): Account => ({ ...toPlayer(row), login: row.login });
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
type KeyRow = {
  key: string;
  attempts: number;
  first_win_attempts: number;
  first_win_duration: number | null;
  best: string | null;
};
type ChatRow = { id: string; player: string; name: string; text: string; created: number };
type VoiceRow = { id: string; player: string; name: string; duration_ms: number; mime: string; created: number };
type VoiceDataRow = { mime: string; data: ArrayBuffer };
type RaceVoiceRow = VoiceRow & {
  game: string;
  key: string;
  read_count: number;
  total: number;
  read: number;
};
type RaceVoiceMetaRow = { player: string; game: string; key: string; created: number };

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

/** Identifiant ou pseudo normalisé pour l'unicité (insensible à la casse). */
export const uniqueKey = (text: string): string => text.toLocaleLowerCase('fr');

export class PlatformStore {
  private readonly sql: SqlStorage;

  constructor(sql: SqlStorage) {
    this.sql = sql;
  }

  /* ---------- Joueurs et sessions ---------- */

  countPlayers(): number {
    return this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM players').one().n;
  }

  /** Vrai si un autre joueur que `except` se connecte déjà avec cet identifiant. */
  isLoginTaken(login: string, except?: PlayerId): boolean {
    return (
      this.sql.exec('SELECT 1 FROM players WHERE login_key = ? AND id != ?', uniqueKey(login), except ?? '').toArray()
        .length > 0
    );
  }

  /** Vrai si un autre joueur que `except` affiche déjà ce pseudo. */
  isNameTaken(name: string, except?: PlayerId): boolean {
    return (
      this.sql.exec('SELECT 1 FROM players WHERE name_key = ? AND id != ?', uniqueKey(name), except ?? '').toArray()
        .length > 0
    );
  }

  insertPlayer(player: PlayerInfo, login: string, passwordHash: string): void {
    this.sql.exec(
      `INSERT INTO players (id, name, name_key, login, login_key, password_hash, created, avatar)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      player.id,
      player.name,
      uniqueKey(player.name),
      login,
      uniqueKey(login),
      passwordHash,
      player.created,
      player.avatar,
    );
  }

  /** Animaux déjà portés par un joueur, sauf `except`. */
  takenAvatars(except?: PlayerId): Set<string> {
    const rows = this.sql
      .exec<{ avatar: string }>('SELECT avatar FROM players WHERE avatar IS NOT NULL AND id != ?', except ?? '')
      .toArray();
    return new Set(rows.map((row) => row.avatar));
  }

  setAvatar(id: PlayerId, avatar: Avatar): void {
    this.sql.exec('UPDATE players SET avatar = ? WHERE id = ?', avatar, id);
  }

  /** Donne un animal libre à chaque joueur qui n'en a pas, du plus ancien au plus récent. */
  assignMissingAvatars(): void {
    const missing = this.sql
      .exec<{ id: string }>('SELECT id FROM players WHERE avatar IS NULL ORDER BY created')
      .toArray();
    if (missing.length === 0) return;
    const taken = this.takenAvatars();
    for (const { id } of missing) {
      const avatar = pickAvatar(id, taken);
      if (!avatar) return;
      taken.add(avatar);
      this.setAvatar(id, avatar);
    }
  }

  /** Change le pseudo affiché ; l'identifiant de connexion reste le même. */
  renamePlayer(id: PlayerId, name: string): void {
    this.sql.exec('UPDATE players SET name = ?, name_key = ? WHERE id = ?', name, uniqueKey(name), id);
  }

  /** Change l'identifiant de connexion ; le pseudo affiché reste le même. */
  changeLogin(id: PlayerId, login: string): void {
    this.sql.exec('UPDATE players SET login = ?, login_key = ? WHERE id = ?', login, uniqueKey(login), id);
  }

  /** Compte d'un joueur, avec son identifiant : à ne renvoyer qu'à son propriétaire. */
  findAccount(id: PlayerId): Account | null {
    const row = this.sql.exec<AccountRow>(`SELECT ${PLAYER_COLUMNS}, login FROM players WHERE id = ?`, id).toArray()[0];
    return row ? toAccount(row) : null;
  }

  findPasswordHash(id: PlayerId): string | null {
    return (
      this.sql.exec<{ password_hash: string }>('SELECT password_hash FROM players WHERE id = ?', id).toArray()[0]
        ?.password_hash ?? null
    );
  }

  findCredentials(login: string): { account: Account; passwordHash: string } | null {
    const row = this.sql
      .exec<CredentialRow>(
        `SELECT ${PLAYER_COLUMNS}, login, password_hash FROM players WHERE login_key = ?`,
        uniqueKey(login),
      )
      .toArray()[0];
    return row ? { account: toAccount(row), passwordHash: row.password_hash } : null;
  }

  findPlayer(id: string): PlayerInfo | null {
    const row = this.sql.exec<PlayerRow>(`SELECT ${PLAYER_COLUMNS} FROM players WHERE id = ?`, id).toArray()[0];
    return row ? toPlayer(row) : null;
  }

  listPlayers(): PlayerInfo[] {
    return this.sql.exec<PlayerRow>(`SELECT ${PLAYER_COLUMNS} FROM players ORDER BY created`).toArray().map(toPlayer);
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
        `SELECT p.id, p.name, p.created, p.avatar
         FROM sessions s JOIN players p ON p.id = s.player WHERE s.token_hash = ?`,
        tokenHash,
      )
      .toArray()[0];
    if (!row) return null;
    this.sql.exec('UPDATE sessions SET last_used = ? WHERE token_hash = ?', now, tokenHash);
    return toPlayer(row);
  }

  deleteSession(tokenHash: string): void {
    this.sql.exec('DELETE FROM sessions WHERE token_hash = ?', tokenHash);
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

  /** Meilleur score d'un joueur sur chaque clé qu'il a gagnée. */
  bestValues(game: GameId, player: PlayerId, order: ScoreOrder): Map<string, number> {
    const best = order === 'asc' ? 'MIN' : 'MAX';
    const rows = this.sql.exec<{ key: string; value: number }>(
      `SELECT key, ${best}(value) AS value FROM runs WHERE game = ? AND player = ? AND status = 'won' GROUP BY key`,
      game,
      player,
    );
    return new Map(rows.toArray().map((row) => [row.key, row.value]));
  }

  /** Clés gagnées au moins une fois, par joueur. */
  wonKeysByPlayer(game: GameId): Map<PlayerId, Set<string>> {
    const won = new Map<PlayerId, Set<string>>();
    const rows = this.sql.exec<{ player: string; key: string }>(
      "SELECT DISTINCT player, key FROM runs WHERE game = ? AND status = 'won'",
      game,
    );
    for (const row of rows) {
      const keys = won.get(row.player) ?? new Set<string>();
      keys.add(row.key);
      won.set(row.player, keys);
    }
    return won;
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

  keyProgress(game: GameId, player: PlayerId, order: ScoreOrder): StoredKeyProgress[] {
    const dir = sqlOrder(order);
    const rows = this.sql
      .exec<KeyRow>(
        `SELECT key, COUNT(*) AS attempts,
                (SELECT COUNT(*) FROM runs b
                   WHERE b.game = r.game AND b.player = r.player AND b.key = r.key
                     AND b.rowid <= (SELECT c.rowid FROM runs c
                                       WHERE c.game = r.game AND c.player = r.player AND c.key = r.key
                                         AND c.status = 'won' ORDER BY c.rowid LIMIT 1)) AS first_win_attempts,
                (SELECT c.duration_ms FROM runs c
                   WHERE c.game = r.game AND c.player = r.player AND c.key = r.key AND c.status = 'won'
                   ORDER BY c.rowid LIMIT 1) AS first_win_duration,
                (SELECT id FROM runs b WHERE b.game = r.game AND b.player = r.player AND b.key = r.key
                   AND b.status = 'won' ORDER BY b.value ${dir}, b.ended LIMIT 1) AS best
         FROM runs r WHERE game = ? AND player = ? GROUP BY key`,
        game,
        player,
      )
      .toArray();
    return rows.map((row) => ({
      key: row.key,
      attempts: row.attempts,
      firstWinAttempts: row.first_win_duration === null ? null : row.first_win_attempts,
      firstWinDurationMs: row.first_win_duration,
      best: row.best ? this.findRunSummary(row.best) : null,
    }));
  }

  /* ---------- Salon ---------- */

  insertChat(message: ChatMessage): void {
    this.sql.exec(
      'INSERT INTO chat_messages (id, player, text, created) VALUES (?, ?, ?, ?)',
      message.id,
      message.player,
      message.text,
      message.at,
    );
  }

  /** Derniers messages du salon, du plus ancien au plus récent. */
  recentChat(limit: number, since: number): ChatMessage[] {
    const rows = this.sql
      .exec<ChatRow>(
        `SELECT c.id, c.player, p.name, c.text, c.created
         FROM chat_messages c JOIN players p ON p.id = c.player
         WHERE c.created >= ?
         ORDER BY c.created DESC
         LIMIT ?`,
        since,
        limit,
      )
      .toArray();
    return rows.reverse().map((row) => ({
      id: row.id,
      player: row.player,
      name: row.name,
      text: row.text,
      at: row.created,
    }));
  }

  pruneChat(before: number): void {
    this.sql.exec('DELETE FROM chat_messages WHERE created < ?', before);
  }

  /* ---------- Notes vocales ---------- */

  insertVoice(note: VoiceNote, data: ArrayBuffer): void {
    this.sql.exec(
      'INSERT INTO voice_notes (id, player, duration_ms, mime, data, created) VALUES (?, ?, ?, ?, ?, ?)',
      note.id,
      note.player,
      note.durationMs,
      note.mime,
      data,
      note.at,
    );
  }

  /** Notes vocales récentes du salon, du plus ancien au plus récent. */
  recentVoices(since: number): VoiceNote[] {
    const rows = this.sql
      .exec<VoiceRow>(
        `SELECT v.id, v.player, p.name, v.duration_ms, v.mime, v.created
         FROM voice_notes v JOIN players p ON p.id = v.player
         WHERE v.created >= ?
         ORDER BY v.created DESC
         LIMIT 50`,
        since,
      )
      .toArray();
    return rows.reverse().map((row) => ({
      id: row.id,
      player: row.player,
      name: row.name,
      durationMs: row.duration_ms,
      mime: row.mime,
      at: row.created,
    }));
  }

  findVoice(id: string): { mime: string; data: Uint8Array } | null {
    const row = this.sql.exec<VoiceDataRow>('SELECT mime, data FROM voice_notes WHERE id = ?', id).toArray()[0];
    if (!row) return null;
    return { mime: row.mime, data: new Uint8Array(row.data) };
  }

  findVoiceMeta(id: string): { player: PlayerId; created: number } | null {
    return (
      this.sql
        .exec<{ player: string; created: number }>('SELECT player, created FROM voice_notes WHERE id = ?', id)
        .toArray()[0] ?? null
    );
  }

  pruneVoices(before: number): void {
    this.sql.exec('DELETE FROM voice_notes WHERE created < ?', before);
  }

  /* ---------- Notes vocales de course ---------- */

  insertRaceVoice(note: RaceVoice, data: ArrayBuffer, recipients: readonly PlayerId[]): void {
    this.sql.exec(
      `INSERT INTO race_voices (id, game, key, player, duration_ms, mime, data, created)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      note.id,
      note.game,
      note.key,
      note.player,
      note.durationMs,
      note.mime,
      data,
      note.at,
    );
    for (const recipient of recipients) {
      this.sql.exec('INSERT INTO race_voice_recipients (note, player) VALUES (?, ?)', note.id, recipient);
    }
  }

  /** Notes de course visibles par un joueur : les siennes et celles dont il est destinataire. */
  recentRaceVoices(viewer: PlayerId, game: GameId, key: string, since: number): RaceVoice[] {
    const rows = this.sql
      .exec<RaceVoiceRow>(
        `SELECT v.id, v.game, v.key, v.player, p.name, v.duration_ms, v.mime, v.created,
                (SELECT COUNT(*) FROM race_voice_reads r WHERE r.note = v.id) AS read_count,
                (SELECT COUNT(*) FROM race_voice_recipients r WHERE r.note = v.id) AS total,
                EXISTS(SELECT 1 FROM race_voice_reads r WHERE r.note = v.id AND r.player = ?) AS read
         FROM race_voices v JOIN players p ON p.id = v.player
         WHERE v.game = ? AND v.key = ? AND v.created >= ?
           AND (v.player = ? OR EXISTS(SELECT 1 FROM race_voice_recipients r WHERE r.note = v.id AND r.player = ?))
         ORDER BY v.created DESC
         LIMIT 50`,
        viewer,
        game,
        key,
        since,
        viewer,
        viewer,
      )
      .toArray();
    return rows.reverse().map((row) => ({
      id: row.id,
      game: row.game,
      key: row.key,
      player: row.player,
      name: row.name,
      durationMs: row.duration_ms,
      mime: row.mime,
      at: row.created,
      readCount: row.read_count,
      total: row.total,
      read: row.read !== 0,
    }));
  }

  findRaceVoice(id: string): { mime: string; data: Uint8Array } | null {
    const row = this.sql.exec<VoiceDataRow>('SELECT mime, data FROM race_voices WHERE id = ?', id).toArray()[0];
    if (!row) return null;
    return { mime: row.mime, data: new Uint8Array(row.data) };
  }

  findRaceVoiceMeta(id: string): RaceVoiceMetaRow | null {
    return (
      this.sql
        .exec<RaceVoiceMetaRow>('SELECT player, game, key, created FROM race_voices WHERE id = ?', id)
        .toArray()[0] ?? null
    );
  }

  isRaceVoiceRecipient(note: string, player: PlayerId): boolean {
    return (
      this.sql.exec('SELECT 1 FROM race_voice_recipients WHERE note = ? AND player = ?', note, player).toArray()
        .length > 0
    );
  }

  insertRaceVoiceRead(note: string, player: PlayerId, at: number): void {
    this.sql.exec('INSERT OR IGNORE INTO race_voice_reads (note, player, read_at) VALUES (?, ?, ?)', note, player, at);
  }

  raceVoiceReadCounts(note: string): { readCount: number; total: number } {
    const row = this.sql
      .exec<{ read_count: number; total: number }>(
        `SELECT (SELECT COUNT(*) FROM race_voice_reads WHERE note = ?) AS read_count,
                (SELECT COUNT(*) FROM race_voice_recipients WHERE note = ?) AS total`,
        note,
        note,
      )
      .one();
    return { readCount: row.read_count, total: row.total };
  }

  /** Notes d'un niveau, chacune avec ses destinataires qui ne l'ont pas encore écoutée. */
  unreadRaceVoiceRecipients(game: GameId, key: string): Map<string, PlayerId[]> {
    const rows = this.sql
      .exec<{ id: string; player: string | null }>(
        `SELECT v.id, r.player
         FROM race_voices v
         LEFT JOIN race_voice_recipients r ON r.note = v.id
           AND NOT EXISTS(SELECT 1 FROM race_voice_reads x WHERE x.note = v.id AND x.player = r.player)
         WHERE v.game = ? AND v.key = ?`,
        game,
        key,
      )
      .toArray();
    const unread = new Map<string, PlayerId[]>();
    for (const row of rows) {
      const players = unread.get(row.id) ?? [];
      if (row.player !== null) players.push(row.player);
      unread.set(row.id, players);
    }
    return unread;
  }

  deleteRaceVoice(id: string): void {
    this.sql.exec('DELETE FROM race_voice_reads WHERE note = ?', id);
    this.sql.exec('DELETE FROM race_voice_recipients WHERE note = ?', id);
    this.sql.exec('DELETE FROM race_voices WHERE id = ?', id);
  }

  /** Notes de course enregistrées avant `before`, avec leur niveau pour prévenir ses joueurs. */
  raceVoicesBefore(before: number): { id: string; game: GameId; key: string }[] {
    return this.sql
      .exec<{ id: string; game: string; key: string }>(
        'SELECT id, game, key FROM race_voices WHERE created < ?',
        before,
      )
      .toArray();
  }

  /** Date d'enregistrement de la plus ancienne note de course, ou `null` s'il n'y en a pas. */
  oldestRaceVoice(): number | null {
    return this.sql.exec<{ oldest: number | null }>('SELECT MIN(created) AS oldest FROM race_voices').one().oldest;
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
