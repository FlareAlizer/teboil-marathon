import { handle, jsonOk } from '@/lib/api';
import { loginPlayer } from '@/lib/queries';
import { normalizeNickname, readJson } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/players — вход участника по нику, который он сам вписал:
 * «Петя Солдат» или юзернейм из Телеграма.
 * Тело: { nickname }
 * Ответ: { id, nickname, totalPoints, todayPoints, created }
 *
 * Пароля нет намеренно: на стенде люди заходят со своих телефонов по QR-коду,
 * и любой лишний шаг — это очередь у волонтёра. Тот же ник ведёт к тому же
 * участнику, поэтому вернувшийся человек продолжает со своими баллами.
 */
export function POST(request: Request) {
  return handle(async () => {
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
