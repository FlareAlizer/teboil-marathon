'use client';

import { useCallback, useEffect, useState } from 'react';
import { ACTIVITIES, ACTIVITY_LABELS, type DayStats } from '@/lib/types';
import { errorText } from './admin-api';
import { getStats } from './endpoints';
import { playersLabel } from './format';

/**
 * Счётчик посетителей за день: сколько всего человек побывало на стенде,
 * сколько прошло квизы и сколько — спортивные активности, плюс разбивка
 * по каждой активности.
 */
export function StatsTab() {
  const [stats, setStats] = useState<DayStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStats(await getStats());
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // Цифры на стенде меняются постоянно — обновляем сами, без действий оператора.
    const timer = setInterval(() => void load(), 15_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="space-y-5 pt-1">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-kiosk-sm font-black uppercase tracking-wide text-teboil-muted">
          Статистика дня
        </h2>
        <button
          type="button"
          onClick={() => void load()}
          className="min-h-tap px-2 font-display text-kiosk-sm font-black uppercase text-teboil-muted active:text-teboil-red"
        >
          Обновить
        </button>
      </div>

      {error && (
        <p className="text-kiosk-sm font-bold text-teboil-red" role="alert">
          {error}
        </p>
      )}

      {!stats && loading && (
        <p className="py-6 text-center text-kiosk-sm text-teboil-muted">Загрузка…</p>
      )}

      {stats && (
        <>
          <div className="rounded-card border-2 border-teboil-red bg-teboil-red/10 p-5 text-center">
            <p className="font-display text-[3.5rem] font-black leading-none text-teboil-black">
              {stats.totalVisitors}
            </p>
            <p className="mt-1 font-display text-kiosk-sm font-black uppercase tracking-wide text-teboil-muted">
              участников за день
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <BigStat label="Прошли квиз" value={stats.quizPlayers} />
            <BigStat label="Спорт-активности" value={stats.sportPlayers} />
          </div>

          <div>
            <h3 className="mb-3 font-display text-kiosk-sm font-black uppercase tracking-wide text-teboil-muted">
              По активностям
            </h3>
            <ul className="space-y-2">
              {ACTIVITIES.map((activity) => {
                const row = stats.byActivity[activity];
                if (!row || row.events === 0) return null;
                return (
                  <li
                    key={activity}
                    className="flex items-center justify-between gap-3 rounded-card border-2 border-teboil-line bg-white/5 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-display text-kiosk-sm font-black text-teboil-black">
                        {ACTIVITY_LABELS[activity]}
                      </p>
                      <p className="text-kiosk-sm text-teboil-muted">
                        {playersLabel(row.players)} · {row.points} баллов
                      </p>
                    </div>
                    <span className="shrink-0 font-display text-kiosk-lg font-black text-teboil-red">
                      {row.events}
                    </span>
                  </li>
                );
              })}
            </ul>
            {ACTIVITIES.every((a) => !stats.byActivity[a]?.events) && (
              <p className="py-4 text-center text-kiosk-sm text-teboil-muted">
                Активности ещё не начинались.
              </p>
            )}
          </div>

          {/* Обычная ссылка, а не fetch: браузер сам скачает файл с cookie сессии */}
          <a
            href={`/api/export?day=${encodeURIComponent(stats.day)}`}
            download
            className="flex min-h-tap-lg w-full items-center justify-center rounded-btn border-2 border-teboil-red font-display text-kiosk-base font-black uppercase tracking-tight text-teboil-red active:bg-teboil-red active:text-white"
          >
            Скачать таблицу за день
          </a>
          <p className="text-center text-kiosk-sm leading-snug text-teboil-muted">
            Всего начислено {stats.totalPoints} баллов · {stats.day}
            <br />
            Файл открывается в Excel: юзернеймы, баллы и все начисления.
          </p>
        </>
      )}
    </div>
  );
}

function BigStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-card border-2 border-teboil-line bg-white/5 p-4 text-center">
      <p className="font-display text-[2.5rem] font-black leading-none text-teboil-black">
        {value}
      </p>
      <p className="mt-1 font-display text-kiosk-sm font-black uppercase leading-tight tracking-wide text-teboil-muted">
        {label}
      </p>
    </div>
  );
}
