import { handle, jsonOk } from '@/lib/api';
import { listPlayersOfDay, searchPlayers } from '@/lib/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/players/search?q=&limit= — поиск участника для админки.
 * Пустой q возвращает участников сегодняшнего дня (последние пришедшие сверху).
 * Ответ: { players: [{ id, nickname, totalPoints, todayPoints }] }
 */
export function GET(request: Request) {
  return handle(async () => {
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') ?? '').trim();
    const limitRaw = Number(url.searchParams.get('limit'));
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 20;

    const players = q.length === 0 ? await listPlayersOfDay(undefined, limit) : await searchPlayers(q, limit);
    return jsonOk({ players });
  });
}
