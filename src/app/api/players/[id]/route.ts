import { handle, jsonError, jsonOk } from '@/lib/api';
import {
  findPlayerById,
  getPlayerEvents,
  getTotalPoints,
} from '@/lib/queries';
import { todayLocal } from '@/lib/db';
import { getPlayerRatings } from '@/lib/ratings';
import { parseDay, parseId } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/players/[id] — карточка участника: профиль, события, суммы.
 * Ответ: { id, nickname, createdAt, eventDay, totalPoints, todayPoints, rank,
 *          ratings: { quiz, keepups, darts, obstacle }, events[] }
 *
 * `rank` оставлен в ответе для совместимости и всегда null: общий рейтинг
 * заменён четырьмя рейтингами дня в `ratings`.
 */
export function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id: rawId } = await ctx.params;
    const id = parseId(rawId, 'id игрока');

    // ?day= — за какой день считать баллы дня и места в рейтингах (по умолчанию сегодня).
    const url = new URL(request.url);
    const day = parseDay(url.searchParams.get('day'), todayLocal());

    const player = await findPlayerById(id);
    if (!player) return jsonError('Участник не найден', 404);

    return jsonOk({
      id: player.id,
      nickname: player.nickname,
      createdAt: player.createdAt,
      eventDay: player.eventDay,
      totalPoints: await getTotalPoints(id),
      todayPoints: await getTotalPoints(id, day),
      // Старый общий рейтинг больше нигде не показывается, а считать его —
      // значит сводить все начисления дня на каждое открытие карточки. При
      // тысячах участников это самый дорогой запрос сайта, и он был впустую.
      rank: null,
      ratings: await getPlayerRatings(id, day),
      events: await getPlayerEvents(id),
    });
  });
}
