import { handle, jsonError, jsonOk } from '@/lib/api';
import { todayLocal } from '@/lib/db';
import { isRatingId } from '@/lib/rating-defs';
import { getAllRatings, getRating } from '@/lib/ratings';
import { parseDay } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/ratings?limit=10 — четыре рейтинга дня: квиз, чеканка, дартс, полоса.
 * GET /api/ratings?board=darts&limit=20 — один рейтинг (экран у станции).
 * Ответ: { day, updatedAt, boards: [{ id, title, unit, rows: [{ rank, id, nickname, value, goal }] }] }
 *
 * Открыт без входа: это то же, что висит на телевизоре.
 */
export function GET(request: Request) {
  return handle(async () => {
    const url = new URL(request.url);
    const raw = Number(url.searchParams.get('limit'));
    const limit = Number.isInteger(raw) && raw > 0 ? Math.min(raw, 100) : 10;
    const day = parseDay(url.searchParams.get('day'), todayLocal());

    const board = url.searchParams.get('board');
    if (board !== null && !isRatingId(board)) {
      return jsonError('board: ожидается quiz, keepups, darts или obstacle', 400);
    }

    return jsonOk({
      day,
      updatedAt: new Date().toISOString(),
      boards: board ? [await getRating(board, limit, day)] : await getAllRatings(limit, day),
    });
  });
}
