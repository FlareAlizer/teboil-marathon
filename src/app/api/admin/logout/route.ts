import { handle, jsonOk } from '@/lib/api';
import { destroyAdminSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/admin/logout — выход оператора, сбрасывает cookie сессии. */
export function POST() {
  return handle(async () => {
    await destroyAdminSession();
    return jsonOk({ authenticated: false });
  });
}
