import { sql, todayLocal, tx } from './db';
import { invalidateLeaderboard } from './leaderboard';
import { invalidateRatings } from './ratings';
import { invalidateStats } from './stats';
import { QUIZ_ACTIVITIES } from './types';

/* ==========================================================================
   Сброс рейтинга квизов за день (страница /reset-quiz).

   Розыгрыш по квизу проходит несколько раз в день, и перед каждым рейтинг
   квизов начинают с нуля. Сбрасываются ТОЛЬКО ответы и бонусы квизов за
   сегодня: рейтинги станций, число участников дня и прошлые дни остаются.

   Ничего не стирается безвозвратно — записи переносятся в архив
   deleted_events одной командой с удалением.
   ========================================================================== */

export interface QuizDayStats {
  day: string;
  /** Ответов и бонусов квизов за день. */
  events: number;
  /** Сколько участников сейчас в рейтинге квизов. */
  players: number;
  /** Когда рейтинг квизов сбрасывали в последний раз (ISO) — или null. */
  lastResetAt: string | null;
}

const ACTIVITIES = [...QUIZ_ACTIVITIES] as string[];

export async function getQuizDayStats(day = todayLocal()): Promise<QuizDayStats> {
  const [row] = await sql<{ events: string; players: string }>(
    `SELECT COUNT(*) AS events, COUNT(DISTINCT player_id) AS players
       FROM score_events
      WHERE event_day = $1 AND activity = ANY($2::text[])`,
    [day, ACTIVITIES],
  );
  return {
    day,
    events: Number(row?.events ?? 0),
    players: Number(row?.players ?? 0),
    lastResetAt: await readEpoch(),
  };
}

async function readEpoch(): Promise<string | null> {
  const [row] = await sql<{ at: Date | string | null }>('SELECT MAX(reset_at) AS at FROM quiz_resets');
  if (!row?.at) return null;
  return row.at instanceof Date ? row.at.toISOString() : new Date(row.at).toISOString();
}

/**
 * Метка последнего сброса для телефонов (уходит вместе с вопросами квиза).
 * Держим в памяти процесса три секунды: квиз открывают часто, а сброс редок.
 */
let epochCache: { at: number; value: string | null } | null = null;

export async function getQuizEpoch(): Promise<string | null> {
  if (epochCache && Date.now() - epochCache.at < 3000) return epochCache.value;
  const value = await readEpoch();
  epochCache = { at: Date.now(), value };
  return value;
}

/** Сброс рейтинга квизов за день. Возвращает, сколько записей ушло в архив. */
export async function resetQuizRating(day = todayLocal()): Promise<{ events: number; players: number }> {
  const result = await tx(async (client) => {
    const moved = await client.query<{ events: string; players: string }>(
      `WITH gone AS (
         DELETE FROM score_events
          WHERE event_day = $1 AND activity = ANY($2::text[])
          RETURNING *
       ),
       kept AS (
         INSERT INTO deleted_events
           (id, player_id, activity, points, raw_result, meta, event_day, created_at, created_by)
         SELECT id, player_id, activity, points, raw_result, meta, event_day, created_at, created_by
           FROM gone
       )
       SELECT COUNT(*) AS events, COUNT(DISTINCT player_id) AS players FROM gone`,
      [day, ACTIVITIES],
    );
    const events = Number(moved.rows[0]?.events ?? 0);
    const players = Number(moved.rows[0]?.players ?? 0);
    // Метка ставится и при пустом сбросе: телефоны всё равно должны начать заново.
    await client.query('INSERT INTO quiz_resets (event_day, events, players) VALUES ($1, $2, $3)', [
      day,
      events,
      players,
    ]);
    return { events, players };
  });

  // Этот процесс видит сброс сразу; остальные три — через 3–5 секунд (срок кешей).
  epochCache = null;
  invalidateRatings();
  invalidateStats();
  invalidateLeaderboard();
  return result;
}
