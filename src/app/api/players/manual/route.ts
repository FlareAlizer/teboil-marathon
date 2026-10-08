import { handle, jsonOk } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { loginPlayer } from '@/lib/queries';
import { normalizeNickname, readJson } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/players/manual — оператор заводит участника вручную.
 * Тело: { nickname }
 * Ответ: { id, nickname, totalPoints, todayPoints, created }
 *
 * Для тех, кто пришёл на станцию без телефона: волонтёр вписывает ник сам.
 * Правило ника то же, что на экране входа, — иначе человек, заведённый здесь,
 * не смог бы потом войти под тем же ником со своего телефона. Требует
 * активной сессии оператора.
 */
export function POST(request: Request) {
  return handle(async () => {
    await requireAdmin();

    const body = await readJson(request);
    const nickname = normalizeNickname(body.nickname);
    const result = await loginPlayer(nickname);

    return jsonOk({
      id: result.player.id,
      nickname: result.player.nickname,
      totalPoints: result.totalPoints,
      todayPoints: result.todayPoints,
      created: result.created,
    });
  });
}
