import { sql, todayLocal } from './db';
import { ACTIVITIES, type Activity, type DayStats } from './types';

/* ==========================================================================
   Статистика дня для панели и телевизора.
   ========================================================================== */

/** Сбрасывается при записях станций и отменах — см. queries.ts. */
export function invalidateStats(): void {
  generation += 1;
  statsCache.clear();
  inflight.clear();
}

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

/**
 * Счётчики дня читают телевизор (каждые 10 секунд) и каждая открытая панель.
 * Это свод по всем начислениям дня, поэтому ответ держится в памяти процесса
 * пять секунд. Записи станций, ручные начисления и отмены сбрасывают его сразу
 * (invalidateBoardCache), так что оператор тут же видит свою запись в цифрах.
 *
 * Одновременные запросы после истечения кеша ждут один пересчёт, а не
 * запускают каждый свой; пересчёт, начатый до сброса, в кеш не кладётся.
 */
type StatsWithDays = DayStats & { days: string[] };
const statsCache = new Map<string, { at: number; value: StatsWithDays }>();
const inflight = new Map<string, Promise<StatsWithDays>>();
let generation = 0;
const STATS_TTL_MS = 5000;

export async function getDayStatsCached(day = todayLocal()): Promise<StatsWithDays> {
  const hit = statsCache.get(day);
  if (hit && Date.now() - hit.at < STATS_TTL_MS) return hit.value;

  const running = inflight.get(day);
  if (running) return running;

  const startedIn = generation;
  const query = Promise.all([getDayStats(day), listEventDays()])
    .then(([stats, days]) => {
      const value = { ...stats, days };
      if (startedIn === generation) statsCache.set(day, { at: Date.now(), value });
      return value;
    })
    .finally(() => {
      if (inflight.get(day) === query) inflight.delete(day);
    });
  inflight.set(day, query);
  return query;
}

/** Дни, когда на стенде кто-то был, новые сверху — для выбора дня в статистике. */
export async function listEventDays(): Promise<string[]> {
  const rows = await sql<{ day: string }>(
    `SELECT DISTINCT to_char(event_day, 'YYYY-MM-DD') AS day FROM visits ORDER BY day DESC`,
  );
  return rows.map((r) => r.day);
}
