import { handle, jsonOk } from '@/lib/api';
import { isAdmin } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/session — жива ли сессия оператора. Ответ: { authenticated } */
export function GET() {
  return handle(async () => jsonOk({ authenticated: await isAdmin() }));
}
