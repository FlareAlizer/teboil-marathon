'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PlayerSummary } from '@/lib/types';
import { displayName } from '@/lib/validation';
import { errorText } from './admin-api';
import { getStats, searchPlayers, type DayStatsWithDays } from './endpoints';
import { pointsLabel } from './format';
import { PlayerStats } from './PlayerStats';

/** Сегодняшняя дата по часам планшета — так же, как её считает сервер стенда. */
function today(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

const ruDay = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

/**
 * Статистика: сначала просто игроки выбранного дня (у кого больше баллов —
 * выше), нажал на игрока — вся информация о нём (см. PlayerStats).
 *
 * Сверху — выбор дня и три итоговых числа, внизу — выгрузка дня в Excel.
 */
export function StatsTab() {
  const [day, setDay] = useState(today);
  const [stats, setStats] = useState<DayStatsWithDays | null>(null);
  const [players, setPlayers] = useState<PlayerSummary[]>([]);
  const [filter, setFilter] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [s, list] = await Promise.all([getStats(day), searchPlayers('', 500, day)]);
      setStats(s);
      setPlayers([...list].sort((a, b) => b.todayPoints - a.todayPoints));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [day]);

  useEffect(() => {
    setLoading(true);
    void load();
    // Цифры на стенде меняются постоянно — обновляем сами.
    const timer = setInterval(() => void load(), 15_000);
    return () => clearInterval(timer);
  }, [load]);

  if (openId !== null) {
    return <PlayerStats id={openId} day={day} onBack={() => setOpenId(null)} />;
  }

  // Сегодня — всегда в списке дней, даже если на стенде ещё никого не было.
  const days = [...new Set([today(), ...(stats?.days ?? [])])].sort().reverse();
  const q = filter.trim().replace(/^@+/, '').toLowerCase();
  const shown = q ? players.filter((p) => p.nickname.toLowerCase().includes(q)) : players;

  return (
    <div className="space-y-4 pt-1">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-kiosk-sm font-black uppercase tracking-wide text-teboil-muted">
          Статистика
        </h2>
        <button
          type="button"
          onClick={() => void load()}
          className="min-h-tap px-2 font-display text-kiosk-sm font-black uppercase text-teboil-muted active:text-teboil-red"
        >
          Обновить
        </button>
      </div>

      {/* Выбор дня: мероприятие идёт несколько дней. */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {days.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => {
              setDay(d);
              setFilter('');
            }}
            className={`min-h-[44px] shrink-0 border-2 px-4 font-display text-[15px] font-black ${
              d === day
                ? 'border-teboil-blue bg-teboil-blue text-white'
                : 'border-teboil-line bg-white text-teboil-black active:bg-teboil-surface'
            }`}
          >
            {d === today() ? 'Сегодня' : ruDay(d)}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="bg-teboil-red px-4 py-3 text-kiosk-sm font-bold text-white">
          {error}
        </p>
      )}

      {stats && (
        <div className="grid grid-cols-3 gap-2">
          <Count value={stats.totalVisitors} label="зашли" />
          <Count value={stats.quizPlayers} label="играли в квиз" />
          <Count value={stats.sportPlayers} label="на станциях" />
        </div>
      )}

      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Найти игрока"
        aria-label="Найти игрока в списке"
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        className="min-h-tap w-full border-2 border-teboil-line bg-white px-4 text-kiosk-base text-teboil-black placeholder:text-teboil-muted/60 focus:border-teboil-blue focus:outline-none"
      />

      {loading && !stats ? (
        <p className="py-6 text-center text-kiosk-sm text-teboil-muted">Загрузка…</p>
      ) : shown.length === 0 ? (
        <p className="py-6 text-center text-kiosk-sm text-teboil-muted">
          {q ? 'Никого не нашли' : 'В этот день на стенде никого не было'}
        </p>
      ) : (
        <ul className="divide-y divide-teboil-line border-y border-teboil-line">
          {shown.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setOpenId(p.id)}
                className="flex min-h-tap w-full items-center gap-3 py-2 text-left active:bg-teboil-surface"
              >
                <span className="w-8 shrink-0 text-center font-display text-[15px] font-black tabular-nums text-teboil-muted">
                  {q ? '' : i + 1}
                </span>
                <span className="min-w-0 flex-1 break-all font-display text-kiosk-base font-bold leading-tight text-teboil-black">
                  {displayName(p.nickname)}
                </span>
                <span className="shrink-0 text-[15px] font-bold tabular-nums text-teboil-blue">
                  {pointsLabel(p.todayPoints)}
                </span>
                <span aria-hidden className="shrink-0 text-teboil-muted">›</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Обычная ссылка, а не fetch: браузер сам скачает файл с cookie сессии */}
      <a
        href={`/api/export?day=${encodeURIComponent(day)}`}
        download
        className="flex min-h-tap-lg w-full items-center justify-center border-2 border-teboil-red font-display text-kiosk-base font-black uppercase tracking-tight text-teboil-red active:bg-teboil-red active:text-white"
      >
        Скачать таблицу за {day === today() ? 'сегодня' : ruDay(day)}
      </a>
    </div>
  );
}

function Count({ value, label }: { value: number; label: string }) {
  return (
    <div className="border-2 border-teboil-line p-2 text-center">
      <p className="font-display text-[2rem] font-black leading-none text-teboil-black">{value}</p>
      <p className="mt-1 text-[12px] font-bold uppercase leading-tight text-teboil-muted">{label}</p>
    </div>
  );
}
