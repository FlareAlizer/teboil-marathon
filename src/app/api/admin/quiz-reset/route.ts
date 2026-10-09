import { handle, jsonError, jsonOk } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { logEvent } from '@/lib/log';
import { getQuizDayStats, resetQuizRating } from '@/lib/quiz-reset';
import { readJson } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/quiz-reset — что сейчас в рейтинге квизов за сегодня.
 * Ответ: { day, events, players, lastResetAt }
 */
export function GET() {
  return handle(async () => {
    await requireAdmin();
    return jsonOk(await getQuizDayStats());
  });
}

/**
 * POST /api/admin/quiz-reset — сброс рейтинга квизов за сегодня.
 * Тело: { confirm: true } — случайный запрос без подтверждения ничего не сбросит.
 * Ответ: { events, players } — сколько записей ушло в архив.
 *
 * Только с сессией оператора. Станции, число участников дня и прошлые дни
 * не затрагиваются; записи не стираются, а переносятся в deleted_events.
 */
export function POST(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const body = await readJson(request);
    if (body.confirm !== true) return jsonError('Нужно подтверждение сброса', 400);

    const result = await resetQuizRating();
    void logEvent('quiz_reset', result, 'warn');
    return jsonOk(result);
  });
}
