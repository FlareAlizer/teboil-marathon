'use client';

import { useCallback, useEffect, useState } from 'react';
import { HOUR, clearState, loadState, saveState } from '@/lib/persist';
import { displayName } from '@/lib/validation';
import { adminLogout, onUnauthorized } from './admin-api';
import { dismiss, useOutbox } from './outbox';
import { checkSession } from './endpoints';
import { LoginForm } from './LoginForm';
import { ScoreScreen } from './ScoreScreen';
import { StatsTab } from './StatsTab';
import { StationsTab } from './stations/StationsTab';

type Auth = 'checking' | 'offline' | 'in' | 'out' | 'expired';

export type AdminTab = 'stations' | 'score' | 'stats';

const TAB_KEY = 'teboil.admin.tab';
/** Панель на этом устройстве открывали с паролем — см. проверку входа ниже. */
const AUTH_KEY = 'teboil.admin.authed';

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
  /** Результаты, которые ещё не дошли до сервера; досылаются сами. */
  const pending = useOutbox();

  // Вкладка переживает перезагрузку страницы. Читаем после монтирования:
  // на сервере памяти устройства нет, и разметка должна совпасть.
  useEffect(() => {
    const saved = loadState<AdminTab>(TAB_KEY, 12 * HOUR);
    if (saved && TABS.some((t) => t.id === saved)) setTab(saved);
  }, []);

  function openTab(next: AdminTab) {
    setTab(next);
    saveState(TAB_KEY, next);
  }

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Панель на этом устройстве уже открывали — показываем её сразу, не
    // дожидаясь сервера. На плохой связи проверка входа шла бы десятки секунд,
    // а работать можно и без неё: записи лягут в очередь на устройстве, поиск
    // возьмёт участников из памяти. Если вход на самом деле истёк, сервер
    // ответит «нет», и появится форма пароля с объяснением.
    const remembered = loadState<boolean>(AUTH_KEY, 12 * HOUR) === true;
    if (remembered) setAuth('in');

    const check = async () => {
      const state = await checkSession();
      if (!alive) return;
      if (state === 'in') {
        saveState(AUTH_KEY, true);
        setAuth('in');
      } else if (state === 'out') {
        clearState(AUTH_KEY);
        setAuth(remembered ? 'expired' : 'out');
      } else {
        // Сервер не ответил — это не «входа нет». Форму пароля не показываем,
        // а пробуем снова, пока связь не вернётся.
        if (!remembered) setAuth('offline');
        timer = setTimeout(() => void check(), 3000);
      }
    };
    void check();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Централизованный перехват 401 из любого экрана админки.
  useEffect(
    () =>
      onUnauthorized(() => {
        clearState(AUTH_KEY);
        setAuth('expired');
      }),
    [],
  );

  // «Точно выйти?» само гаснет: случайное касание не должно висеть ловушкой.
  useEffect(() => {
    if (!confirmExit) return;
    const t = setTimeout(() => setConfirmExit(false), 4000);
    return () => clearTimeout(t);
  }, [confirmExit]);

  const logout = useCallback(async () => {
    await adminLogout();
    clearState(AUTH_KEY);
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
    return (
      <LoginForm
        expired={auth === 'expired'}
        onSuccess={() => {
          saveState(AUTH_KEY, true);
          setAuth('in');
        }}
      />
    );
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

      {pending.length > 0 && (
        <div className="mx-5 mb-3 space-y-1 border-2 border-teboil-blue bg-teboil-blue/5 px-3 py-2">
          {pending.some((e) => !e.error) && (
            <p className="text-[14px] font-bold text-teboil-black">
              Ждут отправки: {pending.filter((e) => !e.error).length}. Связь появится — уйдут сами,
              страницу можно не трогать.
            </p>
          )}
          {/* Сервер отказал по существу — сама такая запись не уйдёт. */}
          {pending
            .filter((e) => e.error)
            .map((e) => (
              <p key={e.clientId} className="flex items-center gap-2 text-[14px] font-bold text-teboil-red">
                <span className="min-w-0 flex-1">
                  Не принято: {displayName(e.nickname)} — {e.label}. {e.error}
                </span>
                <button
                  type="button"
                  onClick={() => dismiss(e.clientId)}
                  className="min-h-[36px] shrink-0 border border-teboil-red px-2 uppercase"
                >
                  Убрать
                </button>
              </p>
            ))}
        </div>
      )}

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
            onClick={() => openTab(item.id)}
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
