import { handle, jsonOk } from '@/lib/api';
import { listPlayersOfDay, searchPlayers } from '@/lib/queries';
import { todayLocal } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/players/search?q=&limit= — поиск участника для админки.
 * Пустой q возвращает участников дня (?day=ГГГГ-ММ-ДД, по умолчанию сегодня).
 * Ответ: { players: [{ id, nickname, totalPoints, todayPoints }] }
 */
export function GET(request: Request) {
  return handle(async () => {
    const url = new URL(request.url);
    // В базе ники без «@», а на экранах — с ним, поэтому волонтёр его и пишет.
    const q = (url.searchParams.get('q') ?? '').trim().replace(/^@+/, '').trim();
    const limitRaw = Number(url.searchParams.get('limit'));
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 20;

    const dayParam = url.searchParams.get('day');
    const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : todayLocal();

    const players = q.length === 0 ? await listPlayersOfDay(day, limit) : await searchPlayers(q, limit);
    return jsonOk({ players });
  });
}
