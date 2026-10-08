import { randomBytes } from 'node:crypto';
import { headers } from 'next/headers';

/* ==========================================================================
   Журнал событий приложения.

   Одна строка — одно событие в JSON: {"t":"…","ev":"quiz_answer",…}. Строки
   уходят в stdout рабочего процесса, а оттуда в journald (journalctl -u
   'teboil@*'). Разбирать их удобно и глазами, и скриптом
   (scripts/collect-logs.sh собирает отчёт за день).

   Каждая строка несёт метку запроса `rid` — тот же $request_id, что nginx
   пишет в свой журнал вместе с адресом, временем ответа и кодом. По ней
   событие приложения склеивается с записью nginx. `dev` — метка устройства
   (случайная, хранится в браузере): по ней видно путь одного телефона от
   открытия сайта до последнего ответа.

   Личных данных сверх ника участника здесь нет. Пароли, тела запросов и
   cookie не пишутся никогда.
   ========================================================================== */

export interface RequestInfo {
  rid: string;
  ip: string;
  dev: string | null;
  uri: string | null;
}

/** Метка устройства: только безопасные символы и ограниченная длина. */
function cleanTag(value: string | null, max = 40): string | null {
  if (!value) return null;
  const v = value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, max);
  return v || null;
}

/** Откуда пришёл запрос. Вне запроса (скрипты, старт процесса) — пустые поля. */
export async function requestInfo(): Promise<RequestInfo> {
  try {
    const h = await headers();
    return {
      rid: cleanTag(h.get('x-request-id'), 32) ?? randomBytes(6).toString('hex'),
      ip: (h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0] ?? '').trim().slice(0, 45),
      dev: cleanTag(h.get('x-device')),
      uri: h.get('x-original-uri')?.slice(0, 200) ?? null,
    };
  } catch {
    return { rid: randomBytes(6).toString('hex'), ip: '', dev: null, uri: null };
  }
}

type Fields = Record<string, unknown>;

/** Обрезка длинных строк: одна строка журнала не должна разрастаться. */
function trimFields(fields: Fields): Fields {
  const out: Fields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    out[k] = typeof v === 'string' && v.length > 300 ? `${v.slice(0, 300)}…` : v;
  }
  return out;
}

function write(level: 'info' | 'warn' | 'error', ev: string, fields: Fields): void {
  // `port` — какой из четырёх рабочих процессов обработал запрос.
  const line = JSON.stringify({
    t: new Date().toISOString(),
    lvl: level,
    ev,
    port: process.env.PORT ?? null,
    ...trimFields(fields),
  });
  // Всё пишем в stdout: уровень лежит в поле lvl, отдельный поток не нужен.
  // Ошибка записи журнала не должна ронять запрос.
  try {
    process.stdout.write(`${line}\n`);
  } catch {
    /* молча */
  }
}

/** Событие с данными о запросе (rid, ip, dev). */
export async function logEvent(ev: string, fields: Fields = {}, level: 'info' | 'warn' | 'error' = 'info'): Promise<void> {
  const req = await requestInfo();
  write(level, ev, { rid: req.rid, ip: req.ip, dev: req.dev, ...fields });
}

/** Событие без запроса — для фоновых задач и запуска. */
export function logPlain(ev: string, fields: Fields = {}, level: 'info' | 'warn' | 'error' = 'info'): void {
  write(level, ev, fields);
}
