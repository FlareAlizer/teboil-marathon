'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminLogout, onUnauthorized } from './admin-api';
import { checkSession } from './endpoints';
import { LoginForm } from './LoginForm';
import { ScoreScreen } from './ScoreScreen';
import { StatsTab } from './StatsTab';
import { StationsTab } from './stations/StationsTab';

type Auth = 'checking' | 'offline' | 'in' | 'out' | 'expired';

export type AdminTab = 'stations' | 'score' | 'stats';

const TABS: Array<{ id: AdminTab; label: string }> = [
  // Станции первыми: на стенде с панелью работают в основном волонтёры станций.
  { id: 'stations', label: 'Станции' },
  { id: 'score', label: 'Вручную' },
  { id: 'stats', label: 'Статистика' },
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
  const [tab, setTab] = useState<AdminTab>('stations');

  const [confirmExit, setConfirmExit] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Сервер не ответил — это не «входа нет». Форму пароля не показываем,
    // а пробуем снова, пока связь не вернётся: вход на устройстве цел.
    const check = async () => {
      const state = await checkSession();
      if (!alive) return;
      setAuth(state);
      if (state === 'offline') timer = setTimeout(() => void check(), 3000);
    };
    void check();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Централизованный перехват 401 из любого экрана админки.
  useEffect(() => onUnauthorized(() => setAuth('expired')), []);

  // «Точно выйти?» само гаснет: случайное касание не должно висеть ловушкой.
  useEffect(() => {
    if (!confirmExit) return;
    const t = setTimeout(() => setConfirmExit(false), 4000);
    return () => clearTimeout(t);
  }, [confirmExit]);

  const logout = useCallback(async () => {
    await adminLogout();
    setConfirmExit(false);
    setAuth('out');
    setTab('stations');
  }, []);

  if (auth === 'checking' || auth === 'offline') {
    return (
      <main className="screen-dark flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="font-display text-kiosk-lg uppercase text-teboil-muted">
          {auth === 'offline' ? 'Нет связи с сервером' : 'Загрузка…'}
        </span>
        {auth === 'offline' && (
          <span className="text-kiosk-sm text-teboil-muted">
            Пробую снова. Вход сохранён — пароль вводить не придётся.
          </span>
        )}
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
        {/* Выход в два касания. В журналах за дни мероприятия «Выйти» нажимали
            раз за разом и тут же входили обратно: кнопку принимали за «выйти
            из экрана», а она разлогинивала — причём сразу во всех вкладках. */}
        <button
          type="button"
          onClick={() => (confirmExit ? void logout() : setConfirmExit(true))}
          className={`min-h-tap px-3 font-display text-kiosk-sm font-black uppercase tracking-wide ${
            confirmExit ? 'bg-teboil-red text-white' : 'text-teboil-muted active:text-teboil-red'
          }`}
        >
          {confirmExit ? 'Выйти из панели?' : 'Выйти'}
        </button>
      </header>

      {/* pb под панель вкладок, чтобы контент не уезжал под неё */}
      <main className="flex-1 px-5 pb-[calc(96px+env(safe-area-inset-bottom))]">
        {tab === 'stations' && <StationsTab />}
        {tab === 'score' && <ScoreScreen />}
        {tab === 'stats' && <StatsTab />}
      </main>

      {/* Вкладки внизу: телефон в одной руке, большой палец достаёт до низа */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 gap-1 border-t border-teboil-line bg-teboil-ink/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            aria-current={tab === item.id ? 'page' : undefined}
            className={`min-h-tap-lg rounded-btn px-1 font-display text-[12px] font-black uppercase leading-tight tracking-tight transition-colors sm:text-kiosk-sm ${
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
