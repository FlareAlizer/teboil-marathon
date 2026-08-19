import { handle, jsonOk } from '@/lib/api';
import { todayLocal } from '@/lib/db';
import { getDayStats } from '@/lib/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/stats?day=YYYY-MM-DD — счётчики дня для админки.
 * Ответ: { day, totalVisitors, quizPlayers, sportPlayers, totalPoints, byActivity }
 */
export function GET(request: Request) {
  return handle(async () => {
    const url = new URL(request.url);
    const dayParam = url.searchParams.get('day');
    const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : todayLocal();
    return jsonOk(await getDayStats(day));
  });
}
