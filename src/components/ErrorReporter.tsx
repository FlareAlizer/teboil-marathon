'use client';

import { useEffect } from 'react';
import { trace, watchConnection } from '@/lib/client-trace';
import { cleanFreshMark, isStaleChunkError, reloadFresh } from '@/lib/chunk-recovery';

/**
 * Пишет в журнал сервера ошибки скриптов, которые не роняют экран целиком
 * (сбой в обработчике нажатия, отклонённое обещание), и пропадание связи.
 * Ничего не рисует. Не больше десяти отметок об ошибках за загрузку
 * страницы — чтобы зациклившаяся ошибка не засыпала журнал.
 *
 * Ошибка загрузки скрипта после выкатки новой версии чинится сама —
 * свежей перезагрузкой (см. chunk-recovery.ts).
 */
export function ErrorReporter() {
  useEffect(() => {
    cleanFreshMark();

    let sent = 0;
    const report = (kind: string, message: unknown, extra?: Record<string, string | number>) => {
      const text = String(message ?? '').slice(0, 200);
      if (isStaleChunkError(text) && reloadFresh(text)) return;
      if (sent >= 10) return;
      sent += 1;
      trace(kind, { error: text, ...extra });
    };
    const onError = (e: ErrorEvent) =>
      report('js_error', e.message, { src: String(e.filename ?? '').split('/').pop() ?? '', line: e.lineno ?? 0 });
    const onRejection = (e: PromiseRejectionEvent) =>
      report('js_reject', (e.reason as Error | undefined)?.message ?? e.reason);

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    const stopWatching = watchConnection();
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      stopWatching();
    };
  }, []);

  return null;
}
