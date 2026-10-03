import { handle, jsonError, jsonOk } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { isRatingId } from '@/lib/rating-defs';
import { getRating, getStationEntries } from '@/lib/ratings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/station?board=darts — экран волонтёра на станции.
 * Ответ: { board: { id, title, unit, rows }, entries: [...] }
 *
 * Только для оператора: в записях видно, кто когда что показал, а отменять
 * их может лишь волонтёр.
 */
export function GET(request: Request) {
  return handle(async () => {
    await requireAdmin();

    const board = new URL(request.url).searchParams.get('board');
    if (!isRatingId(board) || board === 'quiz') {
      return jsonError('board: ожидается keepups, darts или obstacle', 400);
    }

    const [rating, entries] = await Promise.all([
      getRating(board, 10),
      getStationEntries(board),
    ]);
    return jsonOk({ board: rating, entries });
  });
}
