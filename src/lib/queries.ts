import { nicknameKey, sql, todayLocal, tx } from './db';
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

   День события хранится колонкой `event_day`, поэтому запросы дня идут по
   обычным индексам, без вычислений над датой.
   ========================================================================== */

interface PlayerRow {
  id: number;
  nickname: string;
  created_at: Date | string;
  event_day: Date | string;
}

/** Дата из Postgres приходит объектом; наружу отдаём YYYY-MM-DD. */
function asDay(value: Date | string): string {
  return value instanceof Date ? todayLocal(value) : String(value).slice(0, 10);
}

/** Метка времени в виде «YYYY-MM-DD HH:MM:SS» — в таком виде её ждёт клиент. */
function asStamp(value: Date | string): string {
  if (!(value instanceof Date)) return String(value);
  const hh = String(value.getHours()).padStart(2, '0');
  const mm = String(value.getMinutes()).padStart(2, '0');
  const ss = String(value.getSeconds()).padStart(2, '0');
  return `${todayLocal(value)} ${hh}:${mm}:${ss}`;
}

function mapPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    nickname: row.nickname,
    createdAt: asStamp(row.created_at),
    eventDay: asDay(row.event_day),
  };
}

interface EventRow {
  id: number | string;
  player_id: number;
  activity: string;
  points: number | string;
  raw_result: string | null;
  meta: Record<string, unknown> | null;
  created_at: Date | string;
  created_by: string;
}

function mapEvent(row: EventRow): ScoreEvent {
  return {
    id: Number(row.id),
    playerId: row.player_id,
    activity: row.activity as Activity,
    points: Number(row.points),
    rawResult: row.raw_result,
    // meta лежит в jsonb — драйвер уже отдаёт объект, разбирать не нужно.
    meta: row.meta ?? null,
    createdAt: asStamp(row.created_at),
    createdBy: row.created_by as CreatedBy,
  };
}

/* --------------------------------- Игроки -------------------------------- */

export async function findPlayerByNickname(nickname: string): Promise<Player | null> {
  const rows = await sql<PlayerRow>(
    'SELECT * FROM players WHERE nickname_key = $1 ORDER BY id LIMIT 1',
    [nicknameKey(nickname)],
  );
  return rows[0] ? mapPlayer(rows[0]) : null;
}

export async function findPlayerById(id: number): Promise<Player | null> {
  const rows = await sql<PlayerRow>('SELECT * FROM players WHERE id = $1', [id]);
  return rows[0] ? mapPlayer(rows[0]) : null;
}

export interface LoginResult {
  player: Player;
  created: boolean;
  totalPoints: number;
  todayPoints: number;
}

/**
 * Вход по никнейму: если участник уже есть — возвращаем его, иначе создаём.
 *
 * Вставка идёт через ON CONFLICT, а не «сначала проверить, потом вставить».
 * При нескольких рабочих процессах два одновременных входа с одним ником
 * иначе создали бы двух участников, и человек потерял бы часть баллов.
 */
export async function loginPlayer(
  nickname: string,
  day = todayLocal(),
): Promise<LoginResult> {
  const key = nicknameKey(nickname);

  const { player, created } = await tx(async (client) => {
    const inserted = await client.query<PlayerRow>(
      `INSERT INTO players (nickname, nickname_key, event_day)
       VALUES ($1, $2, $3)
       ON CONFLICT (nickname_key) DO NOTHING
       RETURNING *`,
      [nickname, key, day],
    );

    let row = inserted.rows[0];
    const isNew = Boolean(row);

    if (!row) {
      const existing = await client.query<PlayerRow>(
        'SELECT * FROM players WHERE nickname_key = $1',
        [key],
      );
      row = existing.rows[0];
    }

    await client.query(
      `INSERT INTO visits (player_id, event_day) VALUES ($1, $2)
       ON CONFLICT (player_id, event_day) DO NOTHING`,
      [row.id, day],
    );

    return { player: mapPlayer(row), created: isNew };
  });

  return {
    player,
    created,
    totalPoints: await getTotalPoints(player.id),
    todayPoints: await getTotalPoints(player.id, day),
  };
}

/** Одна отметка визита на участника в день. */
export async function registerVisit(
  playerId: number,
  day = todayLocal(),
): Promise<void> {
  await sql(
    `INSERT INTO visits (player_id, event_day) VALUES ($1, $2)
     ON CONFLICT (player_id, event_day) DO NOTHING`,
    [playerId, day],
  );
}

interface SummaryRow {
  id: number;
  nickname: string;
  total_points: string | number;
  today_points: string | number;
}

function mapSummary(r: SummaryRow): PlayerSummary {
  return {
    id: r.id,
    nickname: r.nickname,
    totalPoints: Number(r.total_points),
    todayPoints: Number(r.today_points),
  };
}

/**
 * Поиск для админки: частичное совпадение по никнейму.
 *
 * Сначала отбираем строки и режем LIMIT, и только потом считаем суммы. В
 * обратном порядке суммы вычисляются для каждого совпадения ещё до отсечения,
 * а поиск идёт на каждое нажатие клавиши оператора — на базе целого дня
 * разница была больше чем в тридцать раз.
 */
export async function searchPlayers(
  query: string,
  limit = 20,
): Promise<PlayerSummary[]> {
  const day = todayLocal();
  const exact = query.trim().toLowerCase();
  const like = `%${exact.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

  const rows = await sql<SummaryRow>(
    `WITH found AS (
       SELECT id, nickname
         FROM players
        WHERE lower(nickname) LIKE $1
        ORDER BY (lower(nickname) = $2) DESC, nickname
        LIMIT $3
     )
     SELECT f.id,
            f.nickname,
            COALESCE((SELECT SUM(points) FROM score_events
                       WHERE player_id = f.id), 0) AS total_points,
            COALESCE((SELECT SUM(points) FROM score_events
                       WHERE player_id = f.id AND event_day = $4), 0) AS today_points
       FROM found f
      ORDER BY (lower(f.nickname) = $2) DESC, f.nickname`,
    [like, exact, limit, day],
  );

  return rows.map(mapSummary);
}

/** Участники дня — вид по умолчанию на вкладке «Баллы». */
export async function listPlayersOfDay(
  day = todayLocal(),
  limit = 500,
): Promise<PlayerSummary[]> {
  const rows = await sql<SummaryRow>(
    `WITH found AS (
       SELECT p.id, p.nickname, v.created_at
         FROM players p
         JOIN visits v ON v.player_id = p.id AND v.event_day = $1
        ORDER BY v.created_at DESC
        LIMIT $2
     )
     SELECT f.id,
            f.nickname,
            COALESCE((SELECT SUM(points) FROM score_events
                       WHERE player_id = f.id), 0) AS total_points,
            COALESCE((SELECT SUM(points) FROM score_events
                       WHERE player_id = f.id AND event_day = $1), 0) AS today_points
       FROM found f
      ORDER BY f.created_at DESC`,
    [day, limit],
  );

  return rows.map(mapSummary);
}

/* --------------------------------- Баллы --------------------------------- */

export async function getTotalPoints(playerId: number, day?: string): Promise<number> {
  const rows = day
    ? await sql<{ total: string }>(
        `SELECT COALESCE(SUM(points),0) AS total FROM score_events
          WHERE player_id = $1 AND event_day = $2`,
        [playerId, day],
      )
    : await sql<{ total: string }>(
        'SELECT COALESCE(SUM(points),0) AS total FROM score_events WHERE player_id = $1',
        [playerId],
      );
  return Number(rows[0]?.total ?? 0);
}

export async function getPlayerEvents(
  playerId: number,
  limit = 200,
): Promise<ScoreEvent[]> {
  const rows = await sql<EventRow>(
    'SELECT * FROM score_events WHERE player_id = $1 ORDER BY id DESC LIMIT $2',
    [playerId, limit],
  );
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
  /** Ответ на этот вопрос уже был засчитан — повторно баллы не начислены. */
  duplicate?: boolean;
}

/**
 * Начисление баллов.
 *
 * Для ответов квиза работает уникальный индекс по (участник, активность,
 * вопрос): при гонке двух запросов второй просто не вставится, и мы вернём
 * `duplicate`. Это надёжнее проверки «уже отвечал?» в коде — она при
 * нескольких рабочих процессах гонку проигрывает.
 */
export async function addScoreEvent(input: AddScoreInput): Promise<AddScoreResult> {
  const day = todayLocal();

  const inserted = await tx(async (client) => {
    const result = await client.query<EventRow>(
      `INSERT INTO score_events
         (player_id, activity, points, raw_result, meta, event_day, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [
        input.playerId,
        input.activity,
        input.points,
        input.rawResult ?? null,
        input.meta ? JSON.stringify(input.meta) : null,
        day,
        input.createdBy ?? 'auto',
      ],
    );

    // Участник пришёл на активность — значит он сегодня был на стенде.
    await client.query(
      `INSERT INTO visits (player_id, event_day) VALUES ($1, $2)
       ON CONFLICT (player_id, event_day) DO NOTHING`,
      [input.playerId, day],
    );

    return result.rows[0] ?? null;
  });

  invalidateBoardCache();

  if (!inserted) {
    // Вставки не было: сработал уникальный индекс на ответ квиза.
    const existing = await sql<EventRow>(
      `SELECT * FROM score_events
        WHERE player_id = $1 AND activity = $2 AND meta->>'questionId' = $3
        ORDER BY id LIMIT 1`,
      [input.playerId, input.activity, String(input.meta?.questionId ?? '')],
    );
    return {
      event: mapEvent(existing[0]),
      totalPoints: await getTotalPoints(input.playerId),
      todayPoints: await getTotalPoints(input.playerId, day),
      duplicate: true,
    };
  }

  return {
    event: mapEvent(inserted),
    totalPoints: await getTotalPoints(input.playerId),
    todayPoints: await getTotalPoints(input.playerId, day),
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
 * без отмены единственным выходом осталась бы правка базы руками прямо во
 * время мероприятия.
 */
export async function deleteScoreEvent(id: number): Promise<DeleteScoreResult | null> {
  const rows = await sql<EventRow>(
    'DELETE FROM score_events WHERE id = $1 RETURNING *',
    [id],
  );
  const row = rows[0];
  if (!row) return null;

  invalidateBoardCache();
  const day = todayLocal();

  return {
    deleted: 1,
    playerId: row.player_id,
    points: Number(row.points),
    totalPoints: await getTotalPoints(row.player_id),
    todayPoints: await getTotalPoints(row.player_id, day),
  };
}

/** Сколько раз участник уже играл в активность сегодня. */
export async function countActivityToday(
  playerId: number,
  activity: Activity,
  day = todayLocal(),
): Promise<number> {
  const rows = await sql<{ c: string }>(
    `SELECT COUNT(*) AS c FROM score_events
      WHERE player_id = $1 AND activity = $2 AND event_day = $3`,
    [playerId, activity, day],
  );
  return Number(rows[0]?.c ?? 0);
}

/** События участника по активности за день — нужно для бонуса за все уровни. */
export async function getActivityEventsToday(
  playerId: number,
  activity: Activity,
  day = todayLocal(),
): Promise<ScoreEvent[]> {
  const rows = await sql<EventRow>(
    `SELECT * FROM score_events
      WHERE player_id = $1 AND activity = $2 AND event_day = $3
      ORDER BY id ASC`,
    [playerId, activity, day],
  );
  return rows.map(mapEvent);
}

/* ------------------------------ Кеш лидерборда ---------------------------- */

/**
 * Лидерборд — агрегат по всем начислениям дня и самый частый запрос:
 * телевизор опрашивает его каждые 10 секунд, плюс он открывается на экране
 * станций у каждого участника.
 *
 * Держим его в памяти процесса пару секунд и сбрасываем при любой записи
 * баллов, поэтому устаревшие данные сразу после начисления он не покажет.
 *
 * При нескольких рабочих процессах сброс локален: чужая запись становится
 * видна в пределах этих двух секунд. Для экрана, который и так обновляется
 * раз в 10 секунд, это незаметно.
 */
const boardCache = new Map<string, { at: number; rows: LeaderboardRow[] }>();
const BOARD_TTL_MS = 2000;

function invalidateBoardCache(): void {
  boardCache.clear();
}

/** Топ за сегодня: по сумме баллов, при равенстве — кто раньше начал. */
export async function getLeaderboard(
  limit = 10,
  day = todayLocal(),
): Promise<LeaderboardRow[]> {
  const hit = boardCache.get(day);
  if (hit && Date.now() - hit.at < BOARD_TTL_MS && hit.rows.length >= limit) {
    return hit.rows.slice(0, limit);
  }

  const rows = await sql<{
    id: number;
    nickname: string;
    points: string;
    first_at: Date | string;
  }>(
    `SELECT p.id,
            p.nickname,
            SUM(se.points) AS points,
            MIN(se.created_at) AS first_at
       FROM score_events se
       JOIN players p ON p.id = se.player_id
      WHERE se.event_day = $1
      GROUP BY p.id, p.nickname
      ORDER BY points DESC, first_at ASC, p.id ASC
      LIMIT $2`,
    [day, Math.max(limit, 100)],
  );

  const board = rows.map((r, i) => ({
    rank: i + 1,
    id: r.id,
    nickname: r.nickname,
    points: Number(r.points),
    firstEventAt: asStamp(r.first_at),
  }));

  boardCache.set(day, { at: Date.now(), rows: board });
  return board.slice(0, limit);
}

/**
 * Место участника. Считаем одним запросом, сколько человек стоит выше:
 * строить ради этого весь лидерборд слишком дорого, а экран станций
 * открывает каждый участник. Порядок тот же, что в лидерборде.
 */
export async function getPlayerRank(
  playerId: number,
  day = todayLocal(),
): Promise<number | null> {
  const rows = await sql<{ rank: string; found: string }>(
    `WITH totals AS (
       SELECT player_id, SUM(points) AS pts, MIN(created_at) AS first_at
         FROM score_events
        WHERE event_day = $2
        GROUP BY player_id
     ),
     me AS (SELECT pts, first_at FROM totals WHERE player_id = $1)
     SELECT (SELECT COUNT(*) FROM totals t, me
              WHERE t.pts > me.pts
                 OR (t.pts = me.pts AND t.first_at < me.first_at)
                 OR (t.pts = me.pts AND t.first_at = me.first_at
                     AND t.player_id < $1)) + 1 AS rank,
            (SELECT COUNT(*) FROM me) AS found`,
    [playerId, day],
  );

  const row = rows[0];
  return row && Number(row.found) > 0 ? Number(row.rank) : null;
}

/* ------------------------------- Статистика ------------------------------- */

export async function getDayStats(day = todayLocal()): Promise<DayStats> {
  const [visitors] = await sql<{ c: string }>(
    'SELECT COUNT(*) AS c FROM visits WHERE event_day = $1',
    [day],
  );

  // Три счётчика одним проходом по дню вместо трёх отдельных запросов.
  const [totals] = await sql<{ quiz: string; sport: string; points: string }>(
    `SELECT COUNT(DISTINCT player_id) FILTER (WHERE activity LIKE 'quiz$_%' ESCAPE '$') AS quiz,
            COUNT(DISTINCT player_id) FILTER (WHERE activity LIKE 'sport$_%' ESCAPE '$') AS sport,
            COALESCE(SUM(points),0) AS points
       FROM score_events
      WHERE event_day = $1`,
    [day],
  );

  const rows = await sql<{
    activity: string;
    events: string;
    players: string;
    points: string;
  }>(
    `SELECT activity,
            COUNT(*) AS events,
            COUNT(DISTINCT player_id) AS players,
            COALESCE(SUM(points),0) AS points
       FROM score_events
      WHERE event_day = $1
      GROUP BY activity`,
    [day],
  );

  const byActivity = Object.fromEntries(
    ACTIVITIES.map((a) => [a, { events: 0, players: 0, points: 0 }]),
  ) as DayStats['byActivity'];

  for (const r of rows) {
    if (r.activity in byActivity) {
      byActivity[r.activity as Activity] = {
        events: Number(r.events),
        players: Number(r.players),
        points: Number(r.points),
      };
    }
  }

  return {
    day,
    totalVisitors: Number(visitors?.c ?? 0),
    quizPlayers: Number(totals?.quiz ?? 0),
    sportPlayers: Number(totals?.sport ?? 0),
    totalPoints: Number(totals?.points ?? 0),
    byActivity,
  };
}
