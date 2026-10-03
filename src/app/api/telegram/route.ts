import { handle, jsonOk } from '@/lib/api';
import { telegramConfig } from '@/lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/telegram — включён ли вход через Telegram и куда ведёт кнопка.
 * Ответ: { loginUrl: string | null }
 *
 * Пока на сервере не заданы TELEGRAM_BOT_TOKEN и TELEGRAM_MINIAPP_URL,
 * кнопка на экране входа просто не показывается — ручной ввод работает как раньше.
 */
export function GET() {
  return handle(async () => jsonOk({ loginUrl: telegramConfig()?.loginUrl ?? null }));
}
