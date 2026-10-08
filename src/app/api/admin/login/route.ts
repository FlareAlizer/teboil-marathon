import { handle, jsonOk } from '@/lib/api';
import { adminConfigured, checkPassword, createAdminSession } from '@/lib/auth';
import { logEvent, requestInfo } from '@/lib/log';
import { readJson } from '@/lib/validation';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Ограничение подбора пароля: 20 неверных попыток за 5 минут с одного адреса,
 * затем 5 минут отказа. Порог высокий намеренно: волонтёры на площадке часто
 * сидят за одним Wi-Fi или одной мобильной сетью, и чужие опечатки не должны
 * запирать всех. Счётчик в памяти процесса — на четырёх процессах порог
 * фактически выше, но для пароля из 8 случайных символов этого достаточно.
 */
const WINDOW_MS = 5 * 60_000;
const MAX_FAILS = 20;
const fails = new Map<string, { count: number; since: number }>();

function blocked(ip: string): boolean {
  const entry = fails.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.since > WINDOW_MS) {
    fails.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILS;
}

function noteFail(ip: string): number {
  const now = Date.now();
  const entry = fails.get(ip);
  if (!entry || now - entry.since > WINDOW_MS) {
    // Память не должна расти от перебора с разных адресов.
    if (fails.size > 5000) fails.clear();
    fails.set(ip, { count: 1, since: now });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

/**
 * POST /api/admin/login — вход оператора.
 * Тело: { password }. Пароль берётся из ADMIN_PASSWORD.
 * Успех ставит httpOnly cookie teboil_admin на 12 часов.
 */
export function POST(request: Request) {
  return handle(async () => {
    const { ip } = await requestInfo();

    if (blocked(ip)) {
      void logEvent('admin_login_blocked', { status: 429 }, 'warn');
      return NextResponse.json(
        { ok: false, error: 'Слишком много неверных попыток. Подожди пару минут и попробуй снова' },
        { status: 429 },
      );
    }

    if (!adminConfigured()) {
      void logEvent('admin_login_not_configured', { hint: 'нет ADMIN_PASSWORD в .env' }, 'error');
      return NextResponse.json(
        { ok: false, error: 'Вход оператора не настроен на сервере' },
        { status: 503 },
      );
    }

    const body = await readJson(request);
    if (!checkPassword(body.password)) {
      const count = noteFail(ip);
      void logEvent('admin_login_fail', { fails: count }, 'warn');
      return NextResponse.json({ ok: false, error: 'Неверный пароль' }, { status: 401 });
    }

    fails.delete(ip);
    await createAdminSession();
    void logEvent('admin_login_ok', {});
    return jsonOk({ authenticated: true });
  });
}
