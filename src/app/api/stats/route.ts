import { handle, jsonOk } from '@/lib/api';
import { todayLocal } from '@/lib/db';
import { getDayStatsCached } from '@/lib/stats';
import { parseDay } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/stats?day=YYYY-MM-DD — счётчики дня для админки.
 * Ответ: { day, totalVisitors, quizPlayers, sportPlayers, totalPoints, byActivity, days }
 * days — все дни, когда на стенде кто-то был, новые сверху: для выбора дня в админке.
 */
export function GET(request: Request) {
  return handle(async () => {
    const url = new URL(request.url);
    const day = parseDay(url.searchParams.get('day'), todayLocal());
    return jsonOk(await getDayStatsCached(day));
  });
}
