import { NextResponse } from 'next/server';
import { ValidationError } from './validation';
import { AuthError } from './auth';

/**
 * Единый конверт ответа: { ok: true, data } либо { ok: false, error }.
 * Клиенту всегда достаточно проверить поле `ok`.
 */

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

export function jsonError(error: string, status = 400): NextResponse {
  return NextResponse.json({ ok: false, error }, { status });
}

/** Оборачивает обработчик: валидация → 400, авторизация → 401, прочее → 500. */
export function handle(
  fn: () => Promise<NextResponse> | NextResponse,
): Promise<NextResponse> {
  return Promise.resolve()
    .then(fn)
    .catch((e: unknown) => {
      if (e instanceof ValidationError) return jsonError(e.message, 400);
      if (e instanceof AuthError) return jsonError(e.message, 401);
      console.error('[api]', e);
      const message = e instanceof Error ? e.message : 'Внутренняя ошибка сервера';
      return jsonError(message, 500);
    });
}
