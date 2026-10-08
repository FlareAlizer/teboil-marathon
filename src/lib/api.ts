import { NextResponse } from 'next/server';
import { ValidationError } from './validation';
import { AuthError } from './auth';
import { logEvent, requestInfo } from './log';

/**
 * Единый конверт ответа: { ok: true, data } либо { ok: false, error }.
 * Клиенту всегда достаточно проверить поле `ok`.
 */

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

function errorResponse(error: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error }, { status });
}

/**
 * Отказ по существу (404 «Участник не найден», 400 «Неверный вариант»).
 * Каждый пишется в журнал: по ним видно, на чём спотыкаются люди.
 */
export function jsonError(error: string, status = 400): NextResponse {
  void logEvent('api_reject', { status, error }, 'warn');
  return errorResponse(error, status);
}

/**
 * Оборачивает обработчик: валидация → 400, авторизация → 401, прочее → 500.
 *
 * Текст внутренней ошибки (например, сообщение Postgres) наружу не уходит:
 * человек видит «Ошибка сервера, код …», а полный текст и стек лежат в
 * журнале под тем же кодом — по скриншоту с площадки ошибка находится сразу.
 */
export function handle(
  fn: () => Promise<NextResponse> | NextResponse,
): Promise<NextResponse> {
  return Promise.resolve()
    .then(fn)
    .catch(async (e: unknown) => {
      if (e instanceof ValidationError) {
        void logEvent('api_invalid', { status: 400, error: e.message }, 'warn');
        return errorResponse(e.message, 400);
      }
      if (e instanceof AuthError) {
        void logEvent('api_unauthorized', { status: 401 }, 'warn');
        return errorResponse(e.message, 401);
      }
      const { rid } = await requestInfo();
      const err = e instanceof Error ? e : new Error(String(e));
      void logEvent(
        'api_error',
        { status: 500, error: err.message, code: (e as { code?: string })?.code, stack: err.stack?.split('\n').slice(0, 6).join(' | ') },
        'error',
      );
      return errorResponse(`Ошибка сервера, попробуй ещё раз (код ${rid})`, 500);
    });
}
