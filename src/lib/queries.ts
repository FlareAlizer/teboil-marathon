import { getDb, nicknameKey, nowLocal, todayLocal } from './db';
import {
  ACTIVITIES,
  type Activity,
  type CreatedBy,
  type DayStats,
  type LeaderboardRow,
  type Player,
  type PlayerSummary,
  type ScoreEvent,
} from './types';

/* ==========================================================================
   Запросы к базе. Всё, что пишет и читает players / score_events / visits.
   ========================================================================== */

interface PlayerRow {
  id: number;
  nickname: string;
  created_at: string;
  event_day: string;
}

function mapPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    nickname: row.nickname,
    createdAt: row.created_at,
    eventDay: row.event_day,
  };
}

interface EventRow {
  id: number;
  player_id: number;
  activity: string;
  points: number;
  raw_result: string | null;
  meta: string | null;
  created_at: string;
  created_by: string;
}

function mapEvent(row: EventRow): ScoreEvent {
  let meta: Record<string, unknown> | null = null;
  if (row.meta) {
    try {
      meta = JSON.parse(row.meta) as Record<string, unknown>;
    } catch {
      meta = null;
    }
  }
  return {
    id: row.id,
    playerId: row.player_id,
    activity: row.activity as Activity,
    points: row.points,
    rawResult: row.raw_result,
    meta,
    createdAt: row.created_at,
    createdBy: row.created_by as CreatedBy,
  };
}

/* --------------------------------- Игроки -------------------------------- */

export function findPlayerByNickname(nickname: string): Player | null {
  const row = getDb()
    .prepare('SELECT * FROM players WHERE nickname_key = ? ORDER BY id LIMIT 1')
    .get(nicknameKey(nickname)) as PlayerRow | undefined;
  return row ? mapPlayer(row) : null;
}

export function findPlayerById(id: number): Player | null {
  const row = getDb().prepare('SELECT * FROM players WHERE id = ?').get(id) as
    | PlayerRow
    | undefined;
  return row ? mapPlayer(row) : null;
}

export interface LoginResult {
  player: Player;
  created: boolean;
  totalPoints: number;
  todayPoints: number;
}

/**
 * Вход по никнейму. Если игрок уже есть — возвращаем его (повторный вход),
 * иначе создаём. В обоих случаях отмечаем визит за сегодня, если его ещё нет.
 */
export function loginPlayer(nickname: string, day = todayLocal()): LoginResult {
  const db = getDb();
  const tx = db.transaction((name: string): { player: Player; created: boolean } => {
    const key = nicknameKey(name);
    const existing = db
      .prepare('SELECT * FROM players WHERE nickname_key = ? ORDER BY id LIMIT 1')
      .get(key) as PlayerRow | undefined;

    if (existing) {
      registerVisit(existing.id, day);
      return { player: mapPlayer(existing), created: false };
    }

    const info = db
      .prepare(
        'INSERT INTO players (nickname, nickname_key, created_at, event_day) VALUES (?, ?, ?, ?)',
      )
      .run(name, key, nowLocal(), day);
    const id = Number(info.lastInsertRowid);
    registerVisit(id, day);
    const row = db.prepare('SELECT * FROM players WHERE id = ?').get(id) as PlayerRow;
    return { player: mapPlayer(row), created: true };
  });

  const { player, created } = tx(nickname);
  return {
    player,
    created,
    totalPoints: getTotalPoints(player.id),
    todayPoints: getTotalPoints(player.id, day),
  };
}

/** Одна отметка визита на игрока в день. */
export function registerVisit(playerId: number, day = todayLocal()): void {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO visits (player_id, event_day, created_at)
       VALUES (?, ?, ?)`,
    )
    .run(playerId, day, nowLocal());
}

/** Поиск для админки: частичное совпадение по никнейму. */
export function searchPlayers(query: string, limit = 20): PlayerSummary[] {
  const day = todayLocal();
  const rows = getDb()
    .prepare(
      `SELECT p.id,
              p.nickname,
              COALESCE((SELECT SUM(points) FROM score_events WHERE player_id = p.id), 0) AS total_points,
              COALESCE((SELECT SUM(points) FROM score_events
                        WHERE player_id = p.id AND substr(created_at,1,10) = @day), 0) AS today_points
         FROM players p
        WHERE p.nickname LIKE @like ESCAPE '\\' COLLATE NOCASE
        ORDER BY (p.nickname = @exact COLLATE NOCASE) DESC, p.nickname COLLATE NOCASE
        LIMIT @limit`,
    )
    .all({
      like: `%${query.replace(/[\\%_]/g, (m) => `\\${m}`)}%`,
      exact: query,
      day,
      limit,
    }) as Array<{
    id: number;
    nickname: string;
    total_points: number;
    today_points: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    nickname: r.nickname,
    totalPoints: r.total_points,
    todayPoints: r.today_points,
  }));
}

/** Все игроки дня — для выпадающих списков админки. */
export function listPlayersOfDay(day = todayLocal(), limit = 500): PlayerSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT p.id, p.nickname,
              COALESCE((SELECT SUM(points) FROM score_events WHERE player_id = p.id), 0) AS total_points,
              COALESCE((SELECT SUM(points) FROM score_events
                        WHERE player_id = p.id AND substr(created_at,1,10) = @day), 0) AS today_points
         FROM players p
         JOIN visits v ON v.player_id = p.id AND v.event_day = @day
        ORDER BY v.created_at DESC
        LIMIT @limit`,
    )
    .all({ day, limit }) as Array<{
    id: number;
    nickname: string;
    total_points: number;
    today_points: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    nickname: r.nickname,
    totalPoints: r.total_points,
    todayPoints: r.today_points,
  }));
}

/* --------------------------------- Баллы --------------------------------- */

export function getTotalPoints(playerId: number, day?: string): number {
  const sql = day
    ? `SELECT COALESCE(SUM(points),0) AS total FROM score_events
        WHERE player_id = ? AND substr(created_at,1,10) = ?`
    : 'SELECT COALESCE(SUM(points),0) AS total FROM score_events WHERE player_id = ?';
  const args = day ? [playerId, day] : [playerId];
  const row = getDb().prepare(sql).get(...args) as { total: number };
  return row.total;
}

export function getPlayerEvents(playerId: number, limit = 200): ScoreEvent[] {
  const rows = getDb()
    .prepare(
      'SELECT * FROM score_events WHERE player_id = ? ORDER BY id DESC LIMIT ?',
    )
    .all(playerId, limit) as EventRow[];
  return rows.map(mapEvent);
}

export interface AddScoreInput {
  playerId: number;
  activity: Activity;
  points: number;
  rawResult?: string | null;
  meta?: Record<string, unknown> | null;
  createdBy?: CreatedBy;
}

export interface AddScoreResult {
  event: ScoreEvent;
  totalPoints: number;
  todayPoints: number;
}

export function addScoreEvent(input: AddScoreInput): AddScoreResult {
  const db = getDb();
  const day = todayLocal();
  const info = db
    .prepare(
      `INSERT INTO score_events (player_id, activity, points, raw_result, meta, created_at, created_by)
       VALUES (@playerId, @activity, @points, @rawResult, @meta, @createdAt, @createdBy)`,
    )
    .run({
      playerId: input.playerId,
      activity: input.activity,
      points: input.points,
      rawResult: input.rawResult ?? null,
      meta: input.meta ? JSON.stringify(input.meta) : null,
      createdAt: nowLocal(),
      createdBy: input.createdBy ?? 'auto',
    });

  // Игрок пришёл на активность — значит он сегодня был на стенде.
  registerVisit(input.playerId, day);

  const row = db
    .prepare('SELECT * FROM score_events WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as EventRow;

  return {
    event: mapEvent(row),
    totalPoints: getTotalPoints(input.playerId),
    todayPoints: getTotalPoints(input.playerId, day),
  };
}

export interface DeleteScoreResult {
  deleted: number;
  playerId: number;
  points: number;
  totalPoints: number;
  todayPoints: number;
}

/**
 * Отмена начисления. Оператор работает в спешке у стенда и будет ошибаться —
 * без отмены единственным выходом останется правка базы руками во время
 * мероприятия. Возвращает `deleted: 0`, если записи уже нет: повторный тап
 * по кнопке отмены не должен выглядеть как сбой.
 */
export function deleteScoreEvent(id: number): DeleteScoreResult | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM score_events WHERE id = ?').get(id) as
    | EventRow
    | undefined;

  if (!row) return null;

  const info = db.prepare('DELETE FROM score_events WHERE id = ?').run(id);
  const day = todayLocal();

  return {
    deleted: info.changes,
    playerId: row.player_id,
    points: row.points,
    totalPoints: getTotalPoints(row.player_id),
    todayPoints: getTotalPoints(row.player_id, day),
  };
}

/** Сколько раз игрок уже играл в активность сегодня (защита от накруток). */
export function countActivityToday(
  playerId: number,
  activity: Activity,
  day = todayLocal(),
): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM score_events
        WHERE player_id = ? AND activity = ? AND substr(created_at,1,10) = ?`,
    )
    .get(playerId, activity, day) as { c: number };
  return row.c;
}

/** События игрока по активности за день — нужно для бонуса за все уровни квиза. */
export function getActivityEventsToday(
  playerId: number,
  activity: Activity,
  day = todayLocal(),
): ScoreEvent[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM score_events
        WHERE player_id = ? AND activity = ? AND substr(created_at,1,10) = ?
        ORDER BY id ASC`,
    )
    .all(playerId, activity, day) as EventRow[];
  return rows.map(mapEvent);
}

/* ------------------------------- Лидерборд ------------------------------- */

/** Топ за сегодня: по сумме баллов, при равенстве — кто раньше начал. */
export function getLeaderboard(limit = 10, day = todayLocal()): LeaderboardRow[] {
  const rows = getDb()
    .prepare(
      `SELECT p.id,
              p.nickname,
              SUM(se.points) AS points,
              MIN(se.created_at) AS first_at
         FROM score_events se
         JOIN players p ON p.id = se.player_id
        WHERE substr(se.created_at,1,10) = @day
        GROUP BY p.id, p.nickname
        ORDER BY points DESC, first_at ASC
        LIMIT @limit`,
    )
    .all({ day, limit }) as Array<{
    id: number;
    nickname: string;
    points: number;
    first_at: string;
  }>;

  return rows.map((r, i) => ({
    rank: i + 1,
    id: r.id,
    nickname: r.nickname,
    points: r.points,
    firstEventAt: r.first_at,
  }));
}

/** Позиция конкретного игрока в сегодняшнем зачёте (или null, если без баллов). */
export function getPlayerRank(playerId: number, day = todayLocal()): number | null {
  const board = getLeaderboard(1000, day);
  const found = board.find((r) => r.id === playerId);
  return found ? found.rank : null;
}

/* -------------------------------- Статистика ------------------------------ */

export function getDayStats(day = todayLocal()): DayStats {
  const db = getDb();

  const visitors = db
    .prepare('SELECT COUNT(*) AS c FROM visits WHERE event_day = ?')
    .get(day) as { c: number };

  const quiz = db
    .prepare(
      `SELECT COUNT(DISTINCT player_id) AS c FROM score_events
        WHERE substr(created_at,1,10) = ?
          AND (activity LIKE 'quiz_%' OR activity = 'photo_quiz')`,
    )
    .get(day) as { c: number };

  const sport = db
    .prepare(
      `SELECT COUNT(DISTINCT player_id) AS c FROM score_events
        WHERE substr(created_at,1,10) = ? AND activity LIKE 'sport_%'`,
    )
    .get(day) as { c: number };

  const total = db
    .prepare(
      `SELECT COALESCE(SUM(points),0) AS p FROM score_events
        WHERE substr(created_at,1,10) = ?`,
    )
    .get(day) as { p: number };

  const rows = db
    .prepare(
      `SELECT activity,
              COUNT(*) AS events,
              COUNT(DISTINCT player_id) AS players,
              COALESCE(SUM(points),0) AS points
         FROM score_events
        WHERE substr(created_at,1,10) = ?
        GROUP BY activity`,
    )
    .all(day) as Array<{
    activity: string;
    events: number;
    players: number;
    points: number;
  }>;

  const byActivity = Object.fromEntries(
    ACTIVITIES.map((a) => [a, { events: 0, players: 0, points: 0 }]),
  ) as DayStats['byActivity'];

  for (const r of rows) {
    if (r.activity in byActivity) {
      byActivity[r.activity as Activity] = {
        events: r.events,
        players: r.players,
        points: r.points,
      };
    }
  }

  return {
    day,
    totalVisitors: visitors.c,
    quizPlayers: quiz.c,
    sportPlayers: sport.c,
    totalPoints: total.p,
    byActivity,
  };
}
