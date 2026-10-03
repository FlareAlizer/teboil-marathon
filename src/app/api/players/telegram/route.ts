import { handle, jsonError, jsonOk } from '@/lib/api';
import { loginTelegramPlayer, telegramConfig, verifyInitData } from '@/lib/telegram';
import { readJson } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/players/telegram — вход через Telegram Mini App.
 * Тело: { initData } — строка, которую Telegram передаёт открытому сайту.
 * Ответ: { id, nickname, totalPoints, todayPoints, created } — как у POST /api/players.
 *
 * Подпись initData проверяется ключом бота: без неё любой мог бы прислать
 * чужой id и играть за другого человека.
 */
export function POST(request: Request) {
  return handle(async () => {
    const config = telegramConfig();
    if (!config) return jsonError('Вход через Telegram не настроен', 503);

    const body = await readJson(request);
    const initData = typeof body.initData === 'string' ? body.initData : '';
    if (!initData || initData.length > 4096) return jsonError('Нет данных входа', 400);

    const user = verifyInitData(initData, config.botToken);
    if (!user) return jsonError('Telegram не подтвердил вход — откройте игру заново', 401);

    const result = await loginTelegramPlayer(user);
    return jsonOk({
      id: result.player.id,
      nickname: result.player.nickname,
      totalPoints: result.totalPoints,
      todayPoints: result.todayPoints,
      created: result.created,
    });
  });
}
