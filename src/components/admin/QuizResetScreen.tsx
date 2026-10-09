'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminUnauthorizedError, adminFetch, adminPost, errorText } from './admin-api';
import { LoginForm } from './LoginForm';
import { pluralRu } from './format';

interface QuizDayStats {
  day: string;
  events: number;
  players: number;
  lastResetAt: string | null;
}

type View = 'loading' | 'login' | 'ready';

/**
 * Отдельная страница /reset-quiz: одна кнопка, которая очищает рейтинг квизов
 * за сегодня — перед каждым новым розыгрышем. Рейтинг на телевизоре пустеет
 * сам в течение десяти секунд.
 *
 * Кнопка в два касания: случайное нажатие ничего не сбросит. Доступ — по
 * паролю оператора, иначе рейтинг мог бы обнулить любой, кто узнал ссылку.
 * Станции, число участников дня и прошлые дни не затрагиваются.
 */
export function QuizResetScreen() {
  const [view, setView] = useState<View>('loading');
  const [stats, setStats] = useState<QuizDayStats | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStats(await adminFetch<QuizDayStats>('/api/admin/quiz-reset'));
      setError(null);
      setView('ready');
    } catch (e) {
      if (e instanceof AdminUnauthorizedError) {
        setView('login');
        return;
      }
      setError(errorText(e));
      setView('ready');
    }
  }, []);

  useEffect(() => {
    void load();
    // Цифры обновляются сами: видно, как рейтинг наполняется перед розыгрышем.
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, [load]);

  // «Точно сбросить?» само гаснет через пять секунд.
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 5000);
    return () => clearTimeout(t);
  }, [confirm]);

  async function reset() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await adminPost<{ events: number; players: number }>('/api/admin/quiz-reset', {
        confirm: true,
      });
      setDone(
        r.events === 0
          ? 'Рейтинг квизов уже был пуст.'
          : `Сброшено: ${r.events} ${pluralRu(r.events, 'ответ', 'ответа', 'ответов')} у ${r.players} ${pluralRu(r.players, 'участника', 'участников', 'участников')}. Рейтинг квизов пуст.`,
      );
      setConfirm(false);
      await load();
    } catch (e) {
      if (e instanceof AdminUnauthorizedError) setView('login');
      else setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (view === 'login') {
    return <LoginForm onSuccess={() => { setView('loading'); void load(); }} />;
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-white px-6 py-10 text-center">
      <span className="bg-teboil-red px-4 py-2 font-display text-kiosk-base font-black leading-none text-white">
        TEBOIL
      </span>
      <h1 className="font-display text-[2rem] font-black leading-tight text-teboil-blue">
        Сброс рейтинга квизов
      </h1>

      {view === 'loading' || !stats ? (
        <p className="text-kiosk-sm font-bold text-teboil-muted">{error ?? 'Загрузка…'}</p>
      ) : (
        <p className="text-kiosk-base font-bold text-teboil-black">
          Сейчас в рейтинге квизов:{' '}
          <span className="text-teboil-red">
            {stats.players} {pluralRu(stats.players, 'участник', 'участника', 'участников')}
          </span>
          , {stats.events} {pluralRu(stats.events, 'ответ', 'ответа', 'ответов')}
        </p>
      )}

      {done && (
        <p role="status" className="max-w-md border-2 border-teboil-green bg-teboil-green/10 px-4 py-3 text-kiosk-sm font-bold text-teboil-black">
          ✓ {done} На телевизоре он обновится сам за 10 секунд.
        </p>
      )}
      {error && view === 'ready' && (
        <p role="alert" className="max-w-md bg-teboil-red px-4 py-3 text-kiosk-sm font-bold text-white">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={busy || view !== 'ready'}
        onClick={() => (confirm ? void reset() : (setDone(null), setConfirm(true)))}
        className={`min-h-tap-xl w-full max-w-md px-6 font-display text-kiosk-lg font-black uppercase text-white transition-colors disabled:opacity-40 ${
          confirm ? 'bg-teboil-red active:bg-teboil-red-dark' : 'bg-teboil-blue active:opacity-90'
        }`}
      >
        {busy ? 'Сбрасываем…' : confirm ? 'Точно сбросить? Нажми ещё раз' : 'Сбросить рейтинг квизов'}
      </button>

      <p className="max-w-md text-kiosk-sm font-medium leading-snug text-teboil-muted">
        Сбрасываются только баллы квизов за сегодня. Чеканка, дартс, полоса и число участников
        дня остаются как есть. Участники смогут пройти квиз заново.
        {stats?.lastResetAt && (
          <>
            <br />
            Прошлый сброс: {new Date(stats.lastResetAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
          </>
        )}
      </p>
    </main>
  );
}
