import { logEvent } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/trace?e=login_ok&d=…&p=…&x=…&ts=… — отметка шага с устройства.
 *
 * Пишет одну строку в журнал приложения (событие `client`): какое устройство
 * (d), какой участник (p), какой шаг (e) и пара полей (x). `ts` — когда шаг
 * случился на устройстве, `sent` — когда отметка ушла (если она ждала связи
 * в очереди), `on` — считал ли браузер себя в сети.
 *
 * Всегда отвечает 204 и никогда не падает: отметка не часть игры. Всё
 * обрезается и чистится, чтобы чужой мусор не засорил журнал.
 */
const BAD = /error|fail|crash|reject|offline|timeout|stuck|denied/i;

function clean(value: string | null, max: number, pattern = /[^A-Za-z0-9_:.\-]/g): string | null {
  if (!value) return null;
  const v = value.replace(pattern, '').slice(0, max);
  return v || null;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const p = url.searchParams;
    const event = clean(p.get('e'), 80) ?? 'unknown';
    const ts = Number(p.get('ts'));
    const sent = Number(p.get('sent'));
    const player = Number(p.get('p'));

    await logEvent(
      'client',
      {
        step: event,
        dev: clean(p.get('d'), 40),
        player: Number.isInteger(player) && player > 0 ? player : undefined,
        path: clean(p.get('path'), 40, /[^A-Za-z0-9_/\-]/g),
        online: p.get('on') === '0' ? false : undefined,
        detail: p.get('x')?.slice(0, 400),
        // Когда шаг случился на устройстве (его часы) и сколько отметка шла:
        // большие числа — она ждала связи в очереди.
        at: Number.isFinite(ts) && ts > 1e12 && ts < 1e13 ? new Date(ts).toISOString() : undefined,
        lagS: Number.isFinite(ts) && ts > 0 ? Math.round((Date.now() - ts) / 1000) : undefined,
        queued: Number.isFinite(sent) && sent > 0 ? true : undefined,
        // Браузер — только при старте и на ошибках: в остальных строках он лишний.
        ua: event.startsWith('app_start') || event.startsWith('admin_start') || BAD.test(event)
          ? request.headers.get('user-agent')?.slice(0, 160)
          : undefined,
      },
      BAD.test(event) ? 'warn' : 'info',
    );
  } catch {
    /* отметка не должна ронять ничего */
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
