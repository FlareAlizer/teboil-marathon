/*
 * Сайт из памяти устройства — чтобы обрыв сети не оставлял белую страницу.
 *
 * Правила намеренно осторожные:
 *
 * 1. Страницы (/, /admin, /leaderboard) — всегда СНАЧАЛА сеть. Из памяти
 *    страница берётся, только если сеть не ответила за 4 секунды, недоступна
 *    или сервер ответил своей ошибкой (5xx).
 *    Поэтому после выкатки новой версии люди получают её сразу, а не «когда-нибудь».
 * 2. Файлы приложения (/_next/static/, /img/) — из памяти, если они там есть.
 *    В их именах стоит отпечаток содержимого: изменился файл — изменилось имя,
 *    устареть они не могут.
 * 3. Запросы к /api/ не трогаются вообще. Баллы, ответы и рейтинги — только с
 *    сервера и только свежие.
 *
 * Аварийное отключение: поднять VERSION и заменить обработчик fetch на пустой —
 * браузер заберёт новый файл при следующем заходе и сотрёт старые копии.
 */
const VERSION = 'v1';
const PAGES = `teboil-pages-${VERSION}`;
const ASSETS = `teboil-assets-${VERSION}`;
const PAGE_TIMEOUT_MS = 4000;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith('teboil-') && n !== PAGES && n !== ASSETS).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/img/')) {
    event.respondWith(assetFirst(request));
    return;
  }

  if (request.mode === 'navigate') {
    // Страница сама просит свежую копию (после ошибки загрузки скрипта —
    // см. src/lib/chunk-recovery.ts): только сеть, без подмены из памяти.
    // Иначе на медленной сети старая страница отдавалась бы снова и снова.
    if (url.searchParams.has('__fresh')) return;
    event.respondWith(pageNetworkFirst(request, url.pathname));
  }
});

async function assetFirst(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  if (response.ok && response.type === 'basic') cache.put(request, response.clone());
  return response;
}

/**
 * Страница: сеть, а при обрыве — сохранённая копия. Ключ копии — путь без
 * параметров: «/?from=qr» и «/» это одна и та же страница.
 */
async function pageNetworkFirst(request, pathname) {
  const cache = await caches.open(PAGES);
  const saved = await cache.match(pathname);

  const network = fetch(request).then((response) => {
    if (response.ok && response.type === 'basic') cache.put(pathname, response.clone());
    return response;
  });

  // Копии нет — ждать нечего, остаётся только сеть (как было без воркера).
  if (!saved) return network;

  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), PAGE_TIMEOUT_MS));
  try {
    const response = await Promise.race([network, timeout]);
    // Ответ сервера отдаём как есть, кроме его собственных сбоев (502 на те
    // секунды, пока перезапускается после выкатки): вместо страницы ошибки
    // человек увидит сохранённую страницу, и игра продолжится.
    if (response && response.status < 500) return response;
  } catch {
    // Сети нет совсем — отдаём сохранённую страницу.
  }
  // Сеть ответила позже срока или не ответила: её ошибку гасим, чтобы она не
  // всплыла необработанной, и показываем копию.
  network.catch(() => undefined);
  return saved;
}
