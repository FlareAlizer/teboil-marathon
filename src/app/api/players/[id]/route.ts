import { handle, jsonError, jsonOk } from '@/lib/api';
import {
  findPlayerById,
  getPlayerEvents,
  getPlayerRank,
  getTotalPoints,
} from '@/lib/queries';
import { todayLocal } from '@/lib/db';
import { getPlayerRatings } from '@/lib/ratings';
import { parseId } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/players/[id] — карточка участника: профиль, события, суммы.
 * Ответ: { id, nickname, createdAt, eventDay, totalPoints, todayPoints, rank,
 *          ratings: { quiz, keepups, darts, obstacle }, events[] }
 *
 * `rank` — место в старом общем лидерборде (по сумме всех баллов), оставлено
 * для совместимости. `ratings` — места в четырёх рейтингах дня.
 */
export function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id: rawId } = await ctx.params;
    const id = parseId(rawId, 'id игрока');

    const player = await findPlayerById(id);
    if (!player) return jsonError('Участник не найден', 404);

    return jsonOk({
      id: player.id,
      nickname: player.nickname,
      createdAt: player.createdAt,
      eventDay: player.eventDay,
      totalPoints: await getTotalPoints(id),
      todayPoints: await getTotalPoints(id, todayLocal()),
      rank: await getPlayerRank(id),
      ratings: await getPlayerRatings(id),
      events: await getPlayerEvents(id),
    });
  });
}
