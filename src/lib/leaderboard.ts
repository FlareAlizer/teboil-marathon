import { sql, todayLocal } from './db';
import type { LeaderboardRow } from './types';

/* ==========================================================================
   Общий лидерборд дня — сумма всех баллов (GET /api/leaderboard).

   Держим его в памяти процесса пару секунд. При нескольких рабочих
   процессах сброс локален: чужая запись становится видна в пределах этих
   двух секунд — для экрана, который обновляется раз в 10 секунд, незаметно.
   ========================================================================== */

const boardCache = new Map<string, { at: number; rows: LeaderboardRow[] }>();
const BOARD_TTL_MS = 2000;

/** Сбрасывается при записях станций и отменах — см. invalidateBoardCache в queries.ts. */
export function invalidateLeaderboard(): void {
  boardCache.clear();
}

/** Топ дня: по сумме баллов, при равенстве — кто раньше начал. */
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
    first_at: string;
  }>(
    `SELECT p.id,
            p.nickname,
            SUM(se.points) AS points,
            to_char(MIN(se.created_at), 'YYYY-MM-DD HH24:MI:SS') AS first_at
       FROM score_events se
       JOIN players p ON p.id = se.player_id
      WHERE se.event_day = $1
      GROUP BY p.id, p.nickname
      ORDER BY points DESC, MIN(se.created_at) ASC, p.id ASC
      LIMIT $2`,
    [day, Math.max(limit, 100)],
  );

  const board = rows.map((r, i) => ({
    rank: i + 1,
    id: r.id,
    nickname: r.nickname,
    points: Number(r.points),
    firstEventAt: r.first_at,
  }));

  // Кеш по дням: перебор дат в адресе не должен раздувать память.
  if (boardCache.size >= 30) boardCache.clear();
  boardCache.set(day, { at: Date.now(), rows: board });
  return board.slice(0, limit);
}
