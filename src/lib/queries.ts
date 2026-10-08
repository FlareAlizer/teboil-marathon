import { nicknameKey, sql, todayLocal, tx } from './db';
import { invalidateRatings } from './ratings';
import { invalidateStats } from './stats';
import { invalidateLeaderboard } from './leaderboard';
import {
  type Activity,
  type CreatedBy,
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
  event_day: Date | string;
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
    eventDay: asDay(row.event_day),
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
  /**
   * День, к которому относится запись. По умолчанию сегодня. Запись станции,
   * внесённая без связи в 23:58 и ушедшая на сервер в 00:05, должна попасть
   * в рейтинг и выгрузку того дня, когда человек выступал (см. /api/score).
   */
  day?: string;
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
export async function addScoreEvent(input: AddScoreInput, attempt = 1): Promise<AddScoreResult> {
  const today = todayLocal();
  const day = input.day ?? today;

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

  invalidateBoardCache(input.activity);

  if (!inserted) {
    // Вставки не было: сработал уникальный индекс — на ответ квиза или на
    // метку записи со станции (та же запись пришла повторно после обрыва).
    const clientId = input.meta?.clientId;
    const existing =
      typeof clientId === 'string'
        ? await sql<EventRow>(
            `SELECT * FROM score_events WHERE meta->>'clientId' = $1 LIMIT 1`,
            [clientId],
          )
        : await sql<EventRow>(
            `SELECT * FROM score_events
              WHERE player_id = $1 AND activity = $2 AND meta->>'questionId' = $3
              ORDER BY id LIMIT 1`,
            [input.playerId, input.activity, String(input.meta?.questionId ?? '')],
          );
    if (!existing[0]) {
      // Запись, с которой столкнулась вставка, успели отменить между двумя
      // запросами. Тогда место свободно — пробуем вставить ещё раз (один раз,
      // без зацикливания), а не падаем с 500-й.
      if (attempt < 2) return addScoreEvent(input, attempt + 1);
      throw new Error('Начисление столкнулось с уже отменённой записью');
    }
    return {
      event: mapEvent(existing[0]),
      totalPoints: await getTotalPoints(input.playerId),
      todayPoints: await getTotalPoints(input.playerId, today),
      duplicate: true,
    };
  }

  return {
    event: mapEvent(inserted),
    totalPoints: await getTotalPoints(input.playerId),
    todayPoints: await getTotalPoints(input.playerId, today),
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
  // Удаление и перенос в архив — одна команда: запись не может пропасть
  // между ними, даже если процесс упадёт посередине.
  const rows = await sql<EventRow>(
    `WITH gone AS (DELETE FROM score_events WHERE id = $1 RETURNING *),
          kept AS (
            INSERT INTO deleted_events
              (id, player_id, activity, points, raw_result, meta, event_day, created_at, created_by)
            SELECT id, player_id, activity, points, raw_result, meta, event_day, created_at, created_by
              FROM gone
          )
     SELECT * FROM gone`,
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

/**
 * Вопросы, на которые участник уже отвечал — за ВСЕ дни. Уникальный индекс
 * на ответ (db.ts) не знает дня: второй раз за тот же вопрос баллы не дадут
 * и назавтра, поэтому и показывать его участнику нельзя.
 */
export async function getAnsweredQuestionIds(
  playerId: number,
  activity: Activity,
): Promise<string[]> {
  const rows = await sql<{ id: string }>(
    `SELECT DISTINCT meta->>'questionId' AS id FROM score_events
      WHERE player_id = $1 AND activity = $2
        AND meta->>'kind' = 'answer' AND meta->>'questionId' IS NOT NULL`,
    [playerId, activity],
  );
  return rows.map((r) => r.id);
}

/* ------------------------------ Сброс кешей ------------------------------ */

/**
 * Ответы квиза кеш НЕ сбрасывают. Их сотни в минуту, и сброс на каждый ответ
 * означал, что рейтинги по всему дню пересчитываются почти на каждый запрос:
 * в нагрузочном тесте на 10 000 участников экран станций открывался по
 * несколько секунд. Рейтинг квиза догоняет сам за 3 секунды (TTL в ratings.ts).
 *
 * Записи станций, ручные начисления и отмены редкие, а волонтёр должен сразу
 * увидеть в таблице то, что записал, — они сбрасывают кеш немедленно.
 */
function invalidateBoardCache(activity?: Activity): void {
  if (activity?.startsWith('quiz_')) return;
  invalidateLeaderboard();
  invalidateStats();
  invalidateRatings();
}
