'use client';

import { useEffect } from 'react';

/**
 * Включает сервис-воркер (public/sw.js): после первого захода страница и
 * скрипты открываются из памяти устройства, даже если сеть в этот момент
 * пропала. Что именно и как он хранит — описано в самом sw.js.
 *
 * Только в боевой сборке: при разработке он мешал бы видеть свежие правки.
 * Там, где воркеры не поддерживаются (часть встроенных браузеров), сайт
 * работает как раньше — это улучшение, а не требование.
 */
export function OfflineCache() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);

  return null;
}
