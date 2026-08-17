import { handle, jsonError, jsonOk } from '@/lib/api';
import { checkPassword, createAdminSession } from '@/lib/auth';
import { readJson } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/login — вход оператора.
 * Тело: { password }. Пароль берётся из ADMIN_PASSWORD.
 * Успех ставит httpOnly cookie teboil_admin на 12 часов.
 */
export function POST(request: Request) {
  return handle(async () => {
    const body = await readJson(request);
    if (!checkPassword(body.password)) return jsonError('Неверный пароль', 401);
    await createAdminSession();
    return jsonOk({ authenticated: true });
  });
}
