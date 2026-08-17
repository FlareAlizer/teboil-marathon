'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminLogout, onUnauthorized } from './admin-api';
import { checkSession } from './endpoints';
import { LoginForm } from './LoginForm';
import { ScoreScreen } from './ScoreScreen';
import { PlayersTab } from './PlayersTab';
import { StatsTab } from './StatsTab';
import { PhotoQuestionsTab } from './PhotoQuestionsTab';

type Auth = 'checking' | 'in' | 'out' | 'expired';

export type AdminTab = 'score' | 'players' | 'stats' | 'photo';

const TABS: Array<{ id: AdminTab; label: string }> = [
  { id: 'score', label: 'Баллы' },
  { id: 'players', label: 'Игроки' },
  { id: 'stats', label: 'Статистика' },
  { id: 'photo', label: 'Фото' },
];

/**
 * Оболочка админки: вход, вкладки и единая реакция на истёкшую сессию.
 *
 * Смена длится весь день, cookie живёт 12 часов. Любой запрос, получивший 401,
 * через onUnauthorized переводит экран на форму входа — оператор видит
 * понятное объяснение, а не белый экран и не молчаливо пустой список.
 */
export function AdminApp() {
  const [auth, setAuth] = useState<Auth>('checking');
  const [tab, setTab] = useState<AdminTab>('score');

  useEffect(() => {
    let alive = true;
    void checkSession().then((ok) => {
      if (alive) setAuth(ok ? 'in' : 'out');
    });
    return () => {
      alive = false;
    };
  }, []);

  // Централизованный перехват 401 из любого экрана админки.
  useEffect(() => onUnauthorized(() => setAuth('expired')), []);

  const logout = useCallback(async () => {
    await adminLogout();
    setAuth('out');
    setTab('score');
  }, []);

  if (auth === 'checking') {
    return (
      <main className="screen-dark flex min-h-dvh items-center justify-center">
        <span className="font-display text-kiosk-lg uppercase text-teboil-muted">
          Загрузка…
        </span>
      </main>
    );
  }

  if (auth !== 'in') {
    return <LoginForm expired={auth === 'expired'} onSuccess={() => setAuth('in')} />;
  }

  return (
    <div className="screen-dark flex min-h-dvh flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-4">
        <span className="rounded-lg bg-teboil-red px-3 py-1 font-display text-kiosk-sm font-black leading-none text-white">
          TEBOIL
        </span>
        <button
          type="button"
          onClick={logout}
          className="min-h-tap px-3 font-display text-kiosk-sm font-black uppercase tracking-wide text-teboil-muted active:text-teboil-red"
        >
          Выйти
        </button>
      </header>

      {/* pb под панель вкладок, чтобы контент не уезжал под неё */}
      <main className="flex-1 px-5 pb-[calc(96px+env(safe-area-inset-bottom))]">
        {tab === 'score' && <ScoreScreen />}
        {tab === 'players' && <PlayersTab />}
        {tab === 'stats' && <StatsTab />}
        {tab === 'photo' && <PhotoQuestionsTab />}
      </main>

      {/* Вкладки внизу: телефон в одной руке, большой палец достаёт до низа */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 gap-1 border-t border-teboil-line bg-teboil-ink/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            aria-current={tab === item.id ? 'page' : undefined}
            className={`min-h-tap-lg rounded-btn font-display text-kiosk-sm font-black uppercase tracking-tight transition-colors ${
              tab === item.id
                ? 'bg-teboil-red text-white'
                : 'text-teboil-muted active:bg-white/10'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
