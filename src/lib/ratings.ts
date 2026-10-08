import { sql, todayLocal } from './db';
import {
  RATINGS,
  RATING_IDS,
  type PlayerRating,
  type RatingBoard,
  type RatingId,
  type RatingRow,
  type StationEntry,
} from './rating-defs';

/* ==========================================================================
   Запросы рейтингов. Определения (что считается и как) — в rating-defs.ts.

   Рейтинг дня — это от силы несколько сотен строк, поэтому таблица строится
   целиком и держится в памяти пару секунд: и телевизор, и экран участника,
   и панель волонтёра читают её из кеша, а место конкретного участника
   находится в уже готовой таблице без отдельного запроса.
   ========================================================================== */

/**
 * Верхняя граница на день. Стенд рассчитан на 10 000 участников: при меньшей
 * границе все, кто ниже неё, остались бы «без места», хотя играли.
 */
const FULL_BOARD = 50000;
/**
 * Три секунды. На дне с 10 000 участников рейтинг квиза — это свод по сотне
 * тысяч начислений (около 150 мс в базе), и пересчитывать его на каждый
 * запрос нельзя; а задержка в пару секунд на телевизоре и в карточке
 * участника незаметна.
 */
const TTL_MS = 3000;

const cache = new Map<string, { at: number; rows: RatingRow[] }>();
/** Четыре рейтинга × десяток дней с запасом. */
const CACHE_KEYS_MAX = 40;
/**
 * Пересчёт, который уже идёт. Сотня одновременных запросов после истечения
 * кеша ждёт один и тот же запрос к базе, а не запускает сотню своих.
 */
const inflight = new Map<string, Promise<RatingRow[]>>();
/**
 * Номер «поколения» кеша. Пересчёт, начатый до сброса, мог не увидеть новую
 * запись — его результат в кеш не кладём.
 */
let generation = 0;

/** Сбрасывается при записях станций и отменах — см. queries.ts. */
export function invalidateRatings(): void {
  generation += 1;
  cache.clear();
  inflight.clear();
}

interface Row {
  id: number;
  nickname: string;
  value: string | number;
  goal: string | null;
}

/**
 * Число из `raw_result`. Регулярка стоит внутри CASE, а не в WHERE: так
 * Postgres гарантированно не попытается привести к числу старое «hit/miss»
 * или пустую строку и не уронит весь запрос.
 */
const NUMERIC_RAW = `CASE WHEN se.raw_result ~ '^[0-9]+([.][0-9]+)?$'
                          THEN se.raw_result::numeric END`;

async function queryBoard(id: RatingId, day: string): Promise<RatingRow[]> {
  const def = RATINGS[id];
  let rows: Row[];

  if (def.mode === 'sum') {
    // При равенстве выше тот, кто начал раньше.
    rows = await sql<Row>(
      `SELECT p.id, p.nickname, SUM(se.points) AS value, NULL AS goal
         FROM score_events se
         JOIN players p ON p.id = se.player_id
        WHERE se.event_day = $1 AND se.activity = ANY($2::text[])
        GROUP BY p.id, p.nickname
        ORDER BY value DESC, MIN(se.created_at) ASC, p.id ASC
        LIMIT $3`,
      [day, def.activities, FULL_BOARD],
    );
  } else {
    // Направление берётся из определения, а не из запроса пользователя,
    // поэтому подставлять его в текст безопасно.
    const dir = def.mode === 'max' ? 'DESC' : 'ASC';
    // Лучшая попытка каждого участника; при равенстве выше тот,
    // кто показал этот результат раньше.
    rows = await sql<Row>(
      `WITH tries AS (
         SELECT se.player_id, se.created_at, se.meta, ${NUMERIC_RAW} AS value
           FROM score_events se
          WHERE se.event_day = $1 AND se.activity = ANY($2::text[])
       ),
       best AS (
         SELECT DISTINCT ON (player_id) player_id, value, created_at, meta
           FROM tries
          WHERE value IS NOT NULL
          ORDER BY player_id, value ${dir}, created_at ASC
       )
       SELECT p.id, p.nickname, b.value, b.meta->>'goal' AS goal
         FROM best b
         JOIN players p ON p.id = b.player_id
        ORDER BY b.value ${dir}, b.created_at ASC, p.id ASC
        LIMIT $3`,
      [day, def.activities, FULL_BOARD],
    );
  }

  return rows.map((r, i) => ({
    rank: i + 1,
    id: r.id,
    nickname: r.nickname,
    value: Number(r.value),
    goal: r.goal === null ? null : r.goal === 'true',
  }));
}

async function fullBoard(id: RatingId, day: string): Promise<RatingRow[]> {
  const key = `${id}:${day}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rows;

  const running = inflight.get(key);
  if (running) return running;

  const startedIn = generation;
  const query = queryBoard(id, day)
    .then((rows) => {
      if (startedIn === generation) {
        // Кеш по дням: перебор дат в адресе не должен раздувать память.
        if (cache.size >= CACHE_KEYS_MAX) cache.clear();
        cache.set(key, { at: Date.now(), rows });
      }
      return rows;
    })
    .finally(() => {
      if (inflight.get(key) === query) inflight.delete(key);
    });
  inflight.set(key, query);
  return query;
}

export async function getRating(
  id: RatingId,
  limit = 10,
  day = todayLocal(),
): Promise<RatingBoard> {
  const def = RATINGS[id];
  const rows = await fullBoard(id, day);
  return { id, title: def.title, unit: def.unit, rows: rows.slice(0, limit) };
}

/** Все четыре рейтинга разом — для телевизора. */
export async function getAllRatings(
  limit = 10,
  day = todayLocal(),
): Promise<RatingBoard[]> {
  return Promise.all(RATING_IDS.map((id) => getRating(id, limit, day)));
}

/**
 * Места участника во всех рейтингах. `null` — в этой дисциплине он сегодня
 * ещё не выступал.
 */
export async function getPlayerRatings(
  playerId: number,
  day = todayLocal(),
): Promise<Record<RatingId, PlayerRating | null>> {
  const entries = await Promise.all(
    RATING_IDS.map(async (id) => {
      const rows = await fullBoard(id, day);
      const row = rows.find((r) => r.id === playerId);
      const rating: PlayerRating | null = row
        ? { rank: row.rank, value: row.value, goal: row.goal, of: rows.length }
        : null;
      return [id, rating] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<RatingId, PlayerRating | null>;
}

/* --------------------------- Записи станции дня --------------------------- */

/**
 * Последние записи станции за день, новые сверху. Волонтёр видит, что внёс,
 * и может отменить опечатку, не уходя искать участника во вкладке «Игроки».
 */
export async function getStationEntries(
  id: RatingId,
  limit = 15,
  day = todayLocal(),
): Promise<StationEntry[]> {
  const rows = await sql<{
    id: string | number;
    player_id: number;
    nickname: string;
    value: string | null;
    time_sec: string | null;
    goal: string | null;
    points: number;
    created_at: Date | string;
  }>(
    `SELECT se.id, se.player_id, p.nickname, ${NUMERIC_RAW} AS value,
            se.meta->>'timeSec' AS time_sec, se.meta->>'goal' AS goal,
            se.points, se.created_at
       FROM score_events se
       JOIN players p ON p.id = se.player_id
      WHERE se.event_day = $1 AND se.activity = ANY($2::text[])
      ORDER BY se.created_at DESC, se.id DESC
      LIMIT $3`,
    [day, RATINGS[id].activities, limit],
  );

  return rows.map((r) => ({
    eventId: Number(r.id),
    playerId: r.player_id,
    nickname: r.nickname,
    value: r.value === null ? null : Number(r.value),
    timeSec: r.time_sec === null ? null : Number(r.time_sec),
    goal: r.goal === null ? null : r.goal === 'true',
    points: r.points,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}
