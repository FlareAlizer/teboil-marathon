'use client';

/**
 * Отметки шагов с устройства в журнал сервера (GET /api/trace).
 *
 * Зачем: сервер видит только запросы, которые до него дошли. Что человек
 * открыл сайт, нажал «войти», увидел ошибку, потерял связь — видно только
 * с устройства. По этим отметкам после мероприятия восстанавливается путь
 * каждого телефона: от открытия страницы до последнего ответа.
 *
 * Правила:
 * - никогда не мешает игре: ошибки сети глотаются, ответа никто не ждёт;
 * - у устройства постоянная случайная метка (`dev`), её же получают все
 *   запросы к API заголовком X-Device — события сервера и устройства
 *   склеиваются по ней;
 * - отметка, которая не ушла (нет связи), ложится в маленькую очередь и
 *   досылается со следующей удачной — со временем, когда она случилась;
 * - паролей и содержимого ответов здесь нет: только название шага и пара
 *   коротких полей.
 */

const DEVICE_KEY = 'teboil.device';
const QUEUE_KEY = 'teboil.trace.queue';
const QUEUE_MAX = 40;

let memoryDevice: string | null = null;
let currentPlayer: number | null = null;

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    }
  } catch {
    /* ниже запасной вариант */
  }
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** Постоянная метка этого устройства (браузера). */
export function deviceId(): string {
  if (typeof window === 'undefined') return 'server';
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = randomId();
      window.localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    memoryDevice ??= randomId();
    return memoryDevice;
  }
}

/** С какого участника идут дальнейшие отметки (после входа). */
export function setTracePlayer(id: number | null): void {
  currentPlayer = id;
}

type Detail = Record<string, string | number | boolean | null | undefined>;

interface Queued {
  q: string;
  ts: number;
}

function readQueue(): Queued[] {
  try {
    const list = JSON.parse(window.localStorage.getItem(QUEUE_KEY) ?? '[]') as Queued[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeQueue(list: Queued[]): void {
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(list.slice(-QUEUE_MAX)));
  } catch {
    /* хранилище недоступно — потеряем только отметку */
  }
}

function send(query: string): Promise<boolean> {
  return fetch(`/api/trace?${query}`, {
    cache: 'no-store',
    keepalive: true,
    headers: { 'X-Device': deviceId() },
  })
    .then((r) => r.status < 500)
    .catch(() => false);
}

let flushing = false;
async function flushQueue(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    let list = readQueue();
    while (list.length > 0) {
      const [first] = list;
      // Время отправки дописываем, чтобы сервер видел, сколько отметка ждала.
      if (!(await send(`${first.q}&sent=${Date.now()}`))) return;
      list = readQueue().filter((x) => !(x.q === first.q && x.ts === first.ts));
      writeQueue(list);
    }
  } finally {
    flushing = false;
  }
}

/**
 * Отметка шага. `event` — короткое имя (латиница, цифры, _ и :), `detail` —
 * пара коротких полей: код ответа, текст ошибки, номер вопроса.
 */
export function trace(event: string, detail?: Detail | string): void {
  if (typeof window === 'undefined') return;
  try {
    const ts = Date.now();
    const params = new URLSearchParams({
      e: event.slice(0, 80),
      d: deviceId(),
      ts: String(ts),
      path: window.location.pathname.slice(0, 40),
      on: navigator.onLine ? '1' : '0',
    });
    if (currentPlayer !== null) params.set('p', String(currentPlayer));
    if (detail !== undefined) {
      const text = typeof detail === 'string' ? detail : JSON.stringify(detail);
      params.set('x', text.slice(0, 400));
    }
    const query = params.toString();
    void send(query).then((ok) => {
      if (ok) {
        void flushQueue();
      } else {
        writeQueue([...readQueue(), { q: query, ts }]);
      }
    });
  } catch {
    // Отметка — не часть игры: не получилось, и ладно.
  }
}

/**
 * Отметки о связи: когда браузер сам замечает, что сеть пропала и вернулась.
 * Вешается один раз на страницу (ErrorReporter).
 */
export function watchConnection(): () => void {
  let lostAt: number | null = null;
  const onOffline = () => {
    lostAt = Date.now();
    trace('net_offline');
  };
  const onOnline = () => {
    trace('net_online', { offlineS: lostAt ? Math.round((Date.now() - lostAt) / 1000) : null });
    lostAt = null;
    void flushQueue();
  };
  window.addEventListener('offline', onOffline);
  window.addEventListener('online', onOnline);
  return () => {
    window.removeEventListener('offline', onOffline);
    window.removeEventListener('online', onOnline);
  };
}
