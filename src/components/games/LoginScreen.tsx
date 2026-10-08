'use client';

import { useState } from 'react';
import { SiteQr } from '@/components/SiteQr';
import { AppHeader } from './stations/AppHeader';
import { NicknameField } from './stations/NicknameField';
import { errorText, login, type CurrentPlayer } from './game-api';

/* ---------------------------------- Вход ---------------------------------- */

/**
 * Вход в игру — одно поле. Человек вписывает ник («Петя Солдат» или свой
 * юзернейм из Телеграма) и сразу играет. Ни приложений, ни сторонних сайтов:
 * всё, что нужно для входа, — это наш сайт, поэтому вход одинаково работает
 * на любом телефоне, с VPN и без.
 */
export function LoginScreen({ onLogin }: { onLogin: (p: CurrentPlayer) => void }) {
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;

    const value = nickname.trim();
    // Пустое поле в макете (11:139) имеет собственное состояние ошибки.
    // Молча ничего не делать нельзя: на киоске это выглядит как зависание.
    if (!value) {
      setError('Заполните это поле!');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await login(value);
      onLogin({
        id: result.id,
        nickname: result.nickname,
        totalPoints: result.totalPoints,
        todayPoints: result.todayPoints,
      });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col bg-white">
      <AppHeader points={0} />

      <div className="flex flex-1 items-center justify-center gap-16 px-5 pb-10 pt-8">
        <div className="flex w-full flex-col justify-center lg:max-w-[480px]">
          <h1 className="mb-4 font-display text-[2rem] font-black leading-tight text-teboil-black">
            Придумай <span className="text-teboil-red">ник</span>
          </h1>
          <p className="mb-8 text-kiosk-sm font-medium leading-snug text-teboil-muted">
            Под ним ты попадёшь в рейтинг, а волонтёр на станциях найдёт тебя по
            нему. Подойдёт имя с фамилией или прозвищем — например, «Петя
            Солдат» — или твой юзернейм из Телеграма.
          </p>

          {/* Поле со скошенной кнопкой-стрелкой — как на макете 5:21, а
              состояние ошибки — как на 11:139. Компонент общий, поэтому здесь
              нет ни своей вёрстки поля, ни своей валидации. */}
          <NicknameField
            className="mb-4"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
            onSubmit={() => void submit()}
            error={error}
            placeholder="Петя Солдат"
            maxLength={48}
            disabled={busy}
          />

          <p className="mt-6 text-kiosk-sm font-medium leading-snug text-teboil-muted">
            Уже играл? Введи тот же ник — баллы сохранятся.
            <br />
            Ник общий для всех: выбери такой, чтобы не совпасть с другими, — не
            просто «Петя».
          </p>

          {/* Вход для волонтёра. Намеренно неброский: участнику он не нужен,
              а оператору не приходится помнить адрес и держать второй сайт.
              Панель всё равно закрыта паролем. */}
          <a
            href="/admin"
            className="mt-8 self-center text-kiosk-sm font-bold text-teboil-muted underline underline-offset-4"
          >
            Панель оператора
          </a>
        </div>

        {/* На большом экране (телевизор, планшет боком) рядом с формой — код
            для своего телефона: можно играть, не дожидаясь очереди к экрану. */}
        <SiteQr
          className="hidden flex-col gap-4 text-center lg:landscape:flex"
          imageClassName="h-[min(40vh,320px)] w-[min(40vh,320px)]"
          textClassName="text-[20px]"
        />
      </div>
    </main>
  );
}
