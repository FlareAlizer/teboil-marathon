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
 * Нужен для тех, у кого нет юзернейма в Телеграме: на киоске формат строгий,
 * и без этого обхода такой человек просто не попал бы в игру. Проверка здесь
 * мягкая (буквы, цифры, пробел, дефис), потому что решение принимает живой
 * оператор, а не форма. Требует активной сессии — иначе любой участник мог бы
 * завести себе произвольное имя в обход правил.
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
