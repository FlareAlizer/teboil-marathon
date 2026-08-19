import { handle, jsonOk } from '@/lib/api';
import { loginPlayer } from '@/lib/queries';
import { normalizeTelegramUsername, readJson } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/players — вход участника на киоске по юзернейму в Телеграме.
 * Тело: { nickname }
 * Ответ: { id, nickname, totalPoints, todayPoints, created }
 *
 * Формат строгий: под этим юзернеймом человеку потом выдают приз, поэтому
 * «Вася» вместо @vasya здесь не годится. Тех, у кого юзернейма нет,
 * заводит оператор через POST /api/players/manual.
 */
export function POST(request: Request) {
  return handle(async () => {
    const body = await readJson(request);
    const nickname = normalizeTelegramUsername(body.nickname);
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
