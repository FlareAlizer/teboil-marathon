'use client';

import { useEffect } from 'react';
import { trace } from '@/components/games/game-api';

/**
 * Пишет в журнал сервера ошибки скриптов, которые не роняют экран целиком
 * (сбой в обработчике нажатия, отклонённое обещание). Ничего не рисует.
 * Не больше пяти отметок за загрузку страницы — чтобы зациклившаяся ошибка
 * не засыпала журнал.
 */
export function ErrorReporter() {
  useEffect(() => {
    let sent = 0;
    const report = (kind: string, message: unknown) => {
      if (sent >= 5) return;
      sent += 1;
      trace(`${kind}:${String(message).slice(0, 140)}`);
    };
    const onError = (e: ErrorEvent) => report('js_error', e.message);
    const onRejection = (e: PromiseRejectionEvent) =>
      report('js_reject', (e.reason as Error | undefined)?.message ?? e.reason);

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
