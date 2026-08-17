import { handle, jsonOk } from '@/lib/api';
import { todayLocal } from '@/lib/db';
import { getLeaderboard } from '@/lib/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/leaderboard?limit=10 — топ за сегодняшний день.
 * Сортировка: баллы по убыванию, при равенстве — кто раньше начал играть.
 * Ответ: { day, updatedAt, rows: [{ rank, id, nickname, points, firstEventAt }] }
 */
export function GET(request: Request) {
  return handle(() => {
    const url = new URL(request.url);
    const raw = Number(url.searchParams.get('limit'));
    const limit = Number.isInteger(raw) && raw > 0 ? Math.min(raw, 100) : 10;
    const day = url.searchParams.get('day') ?? todayLocal();

    return jsonOk({
      day,
      updatedAt: new Date().toISOString(),
      rows: getLeaderboard(limit, day),
    });
  });
}
