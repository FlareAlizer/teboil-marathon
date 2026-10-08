'use client';

import { useEffect } from 'react';
import { trace } from '@/components/games/game-api';

/**
 * Экран на случай сбоя в самом приложении.
 *
 * Без него любая ошибка скрипта оставляла белую страницу без единой кнопки:
 * участник или волонтёр видел «сайт сломался» и не знал, что делать. Теперь
 * есть объяснение и выход, а сама ошибка уходит в журнал сервера — иначе о
 * таких сбоях мы узнавали бы только по пересказам.
 */
export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    trace(`js_crash:${String(error?.message ?? error).slice(0, 140)}`);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-white px-6 text-center">
      <h1 className="font-display text-[1.75rem] font-black leading-tight text-teboil-blue">
        Что-то пошло не так
      </h1>
      <p className="text-kiosk-sm font-medium text-teboil-muted">
        Баллы и результаты сохранены — они на сервере. Нажми «Обновить», и можно продолжать.
      </p>
      <button
        type="button"
        onClick={() => {
          reset();
          window.location.reload();
        }}
        className="min-h-tap-lg bg-teboil-red px-8 font-display text-kiosk-base font-black text-white active:bg-teboil-red-dark"
      >
        Обновить
      </button>
    </main>
  );
}
