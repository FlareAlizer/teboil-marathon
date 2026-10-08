'use client';

import { useEffect, useState } from 'react';
import type { QuizVariant } from '@/lib/types';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui';
import { AppHeader } from './stations/AppHeader';
import { NicknameField } from './stations/NicknameField';
import { StationsScreen } from './stations/StationsScreen';
import {
  clearPlayer,
  errorText,
  getTelegramLoginUrl,
  loadPlayer,
  login,
  readTelegramInitData,
  savePlayer,
  telegramLogin,
  trace,
  type CurrentPlayer,
} from './game-api';
import { RouletteQuiz } from './RouletteQuiz';
import { QuizPickScreen } from './QuizPickScreen';
import { SportsShowcase } from './SportsShowcase';

type Screen =
  | 'menu'
  | 'stations'
  | 'quizPick'
  | 'quiz'
  | 'sports';

/**
 * Корень игровой части киоска.
 *
 * Планшет передают из рук в руки, поэтому текущий участник запоминается,
 * а кнопка «Следующий участник» вынесена на видное место — без неё
 * следующий человек играл бы под чужим никнеймом.
 */
export function GameApp() {
  const [player, setPlayer] = useState<CurrentPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>('menu');
  const [variant, setVariant] = useState<QuizVariant>('v1');

  const [tgError, setTgError] = useState<string | null>(null);

  useEffect(() => {
    // Внутри Telegram участник уже известен — входим сразу, без экрана входа.
    // Это его собственный телефон, поэтому аккаунт Telegram важнее того, что
    // осталось в памяти браузера.
    const initData = readTelegramInitData();
    if (!initData) {
      const saved = loadPlayer();
      // Отметка «приложение запустилось»: страницу сервер отдаёт всегда, а вот
      // дошли ли до телефона скрипты, по журналу иначе не понять.
      trace(saved ? 'start_saved' : 'start_new');
      setPlayer(saved);
      setReady(true);
      return;
    }

    trace('start_in_telegram');

    expandTelegramView();
    telegramLogin(initData)
      .then((result) => {
        const p: CurrentPlayer = {
          id: result.id,
          nickname: result.nickname,
          totalPoints: result.totalPoints,
          todayPoints: result.todayPoints,
        };
        savePlayer(p);
        setPlayer(p);
      })
      .catch((e: unknown) => {
        // Не вышло — остаётся обычный вход по юзернейму, с объяснением.
        setTgError(errorText(e));
        setPlayer(loadPlayer());
      })
      .finally(() => setReady(true));
  }, []);

  function updatePoints(totalPoints: number, todayPoints: number) {
    setPlayer((p) => {
      if (!p) return p;
      const next = { ...p, totalPoints, todayPoints };
      savePlayer(next);
      return next;
    });
  }

  function finish() {
    clearPlayer();
    setPlayer(null);
    setScreen('menu');
  }

  /**
   * «К станциям» со всех экранов квиза — хаб участника со списком активностей
   * и прогрессом. Экран сам грузит данные по `playerId`, поэтому очки и события
   * ему прокидывать не нужно.
   */
  function toStations() {
    setScreen('stations');
  }

  if (!ready) {
    return <div className="min-h-dvh bg-white" />;
  }

  if (!player) {
    return (
      <LoginScreen
        initialError={tgError}
        onLogin={(p) => {
          savePlayer(p);
          setPlayer(p);
          setScreen('menu');
        }}
      />
    );
  }

  if (screen === 'stations') {
    return (
      <StationsScreen playerId={player.id} onBack={() => setScreen('menu')} />
    );
  }

  if (screen === 'quizPick') {
    return (
      <QuizPickScreen
        points={player.todayPoints}
        onPick={(v) => {
          setVariant(v);
          setScreen('quiz');
        }}
        onStations={toStations}
      />
    );
  }

  if (screen === 'quiz') {
    return (
      <RouletteQuiz
        variant={variant}
        player={player}
        onPoints={updatePoints}
        onStations={toStations}
      />
    );
  }

  if (screen === 'sports') {
    return <SportsShowcase player={player} onExit={() => setScreen('menu')} />;
  }

  return <Menu player={player} onGo={setScreen} onFinish={finish} />;
}

/* ---------------------------------- Вход ---------------------------------- */

function LoginScreen({
  onLogin,
  initialError,
}: {
  onLogin: (p: CurrentPlayer) => void;
  initialError: string | null;
}) {
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [tgUrl, setTgUrl] = useState<string | null>(null);
  const [tgStuck, setTgStuck] = useState(false);

  // Кнопка появляется, только если на сервере настроен бот. Внутри самого
  // Telegram она не нужна: туда участник попадает уже с готовым входом.
  useEffect(() => {
    if (readTelegramInitData()) return;
    let alive = true;
    void getTelegramLoginUrl().then((url) => {
      if (alive) setTgUrl(url);
    });
    return () => {
      alive = false;
    };
  }, []);

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

      <div className="flex flex-1 flex-col justify-center px-5 pb-10 pt-8">
        <h1 className="mb-4 font-display text-[2rem] font-black leading-tight text-teboil-black">
          Твой <span className="text-teboil-red">юзернейм</span> в Телеграме
        </h1>
        <p className="mb-8 text-kiosk-sm font-medium leading-snug text-teboil-muted">
          По нему начисляются баллы и выдаются призы. Этот же юзернейм ты
          назовёшь волонтёру на спортивных активностях.
        </p>

        {tgUrl && (
          <>
            {/* Самый быстрый путь со своего телефона: одно касание, и игра
                открывается в Telegram уже под твоим аккаунтом. */}
            <a
              href={tgLink(tgUrl)}
              onClick={() => {
                trace(tgLink(tgUrl).startsWith('tg:') ? 'tg_click_app' : 'tg_click_https');
                // Вернулся на страницу после ухода — значит, в Telegram войти
                // не получилось (иначе игра продолжилась бы там).
                const onBack = () => {
                  if (document.visibilityState !== 'visible') return;
                  trace('tg_came_back');
                  document.removeEventListener('visibilitychange', onBack);
                };
                document.addEventListener('visibilitychange', onBack);
                // Если через пару секунд страница всё ещё на экране, приложение
                // не открылось (нет Telegram или браузер не пустил) — подсказываем.
                setTimeout(() => {
                  if (document.visibilityState !== 'visible') return;
                  trace('tg_not_opened');
                  setTgStuck(true);
                }, 2500);
              }}
              className="flex min-h-tap-xl items-center justify-center gap-3 bg-[#2AABEE] px-5 font-display text-kiosk-base font-black text-white active:bg-[#229ED9]"
            >
              <TelegramIcon />
              Войти через Telegram
            </a>
            {tgStuck ? (
              <p className="mb-6 mt-2 bg-teboil-surface px-3 py-2 text-[14px] font-medium leading-snug text-teboil-black">
                Telegram не открылся? Не страшно — впиши свой юзернейм ниже. Он есть в
                Telegram: Настройки → Имя пользователя.
              </p>
            ) : (
              <p className="mb-6 mt-2 text-center text-[14px] font-medium text-teboil-muted">
                Ничего вводить не нужно
              </p>
            )}
            <p className="mb-3 text-center text-kiosk-sm font-bold text-teboil-muted">
              или впиши юзернейм вручную
            </p>
          </>
        )}

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
          placeholder="@running_fox"
          maxLength={33}
          disabled={busy}
        />

        <p className="mt-6 text-kiosk-sm font-medium leading-snug text-teboil-muted">
          Уже играл сегодня? Введи тот же юзернейм — баллы сохранятся.
          <br />
          {tgUrl
            ? 'Нет юзернейма в Телеграме? Жми «Войти через Telegram» — он не нужен.'
            : 'Нет юзернейма в Телеграме? Подойди к волонтёру, он тебя запишет.'}
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
    </main>
  );
}

const TG_APP_LINK = /^https?:\/\/t\.me\/([A-Za-z0-9_]+)\/([A-Za-z0-9_]+)\/?$/;

/**
 * Куда ведёт кнопка «Войти через Telegram».
 *
 * Обычная ссылка `https://t.me/бот/приложение` на андроиде сначала грузит сайт
 * t.me в браузере, а он из России без VPN не открывается — участник видел
 * ERR_TIMED_OUT и думал, что сломан наш сайт. Ссылка `tg://` открывает само
 * приложение Telegram, минуя t.me.
 *
 * На айфоне оставляем https: там система сама перехватывает такую ссылку и
 * открывает приложение без захода на сайт, а на `tg://` Safari задаёт лишний
 * вопрос «Открыть в Telegram?».
 */
function tgLink(url: string): string {
  const m = TG_APP_LINK.exec(url);
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  return m && !ios ? `tg://resolve?domain=${m[1]}&appname=${m[2]}` : url;
}

/** Бумажный самолётик Telegram — по нему кнопку узнают без чтения. */
function TelegramIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-7 w-7 shrink-0" fill="currentColor">
      <path d="M21.9 4.3 18.7 19.4c-.2 1.1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.3-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.2 13.1l-4.8-1.5c-1-.3-1.1-1 .2-1.5L20.4 2.9c.9-.3 1.7.2 1.5 1.4Z" />
    </svg>
  );
}

/**
 * Разворачивает окно игры внутри Telegram на весь экран. Официальный скрипт
 * подгружается только здесь, внутри Telegram, и не обязателен: если он не
 * загрузится, игра просто откроется в окне обычной высоты.
 */
function expandTelegramView() {
  type WebApp = { ready?: () => void; expand?: () => void };
  const apply = () => {
    const app = (window as unknown as { Telegram?: { WebApp?: WebApp } }).Telegram?.WebApp;
    app?.ready?.();
    app?.expand?.();
  };
  const script = document.createElement('script');
  script.src = 'https://telegram.org/js/telegram-web-app.js';
  script.async = true;
  script.onload = apply;
  document.head.appendChild(script);
}

/* ---------------------------------- Меню ---------------------------------- */

function Menu({
  player,
  onGo,
  onFinish,
}: {
  player: CurrentPlayer;
  onGo: (s: Screen) => void;
  onFinish: () => void;
}) {
  const [inTelegram, setInTelegram] = useState(false);
  useEffect(() => setInTelegram(readTelegramInitData() !== null), []);

  return (
    <main className="flex min-h-dvh flex-col bg-white">
      <AppHeader points={player.todayPoints} />

      <div className="flex flex-1 flex-col px-5 pb-8 pt-8">
        <h1 className="mb-7 font-display text-[2rem] font-black leading-tight text-teboil-black">
          Выбери игру
        </h1>

        <div className="space-y-4">
          <Tile
            tone="red"
            title="Квизы"
            note="Девять рубрик о беге и гонка чемпионов"
            onClick={() => onGo('quizPick')}
          />
          {/* В макете на главном ровно две большие плитки: «Квизы» и
              «Эстафета». Эстафета — витрина станций: замер времени делает
              волонтёр, баллы заводит оператор. */}
          <Tile
            tone="blue"
            title="Эстафета"
            note="Чеканка, дартс, полоса препятствий"
            onClick={() => onGo('sports')}
          />
        </div>

        <div className="mt-auto flex flex-col gap-4 pt-10">
          <Button
            variant="secondary"
            size="md"
            fullWidth
            onClick={() => onGo('stations')}
          >
            Мои станции
          </Button>

          <a
            href="/leaderboard"
            className={cn(
              'flex min-h-tap w-full items-center justify-center skew-x-brand',
              'border-2 border-teboil-blue bg-white font-display text-kiosk-base font-bold text-teboil-blue',
            )}
          >
            <span className="skew-x-brand-inv">Лидерборд</span>
          </a>

          {/* Внутри Telegram это личный телефон, а не общий планшет: передавать
              его следующему некому, а «выйти» означало бы только потерять вход. */}
          {!inTelegram && (
            <Button variant="danger" size="md" fullWidth onClick={onFinish}>
              Следующий участник
            </Button>
          )}

          {/* Вход для волонтёра — тот же, что на экране входа. На личном
              телефоне участника внутри Telegram он не нужен. */}
          {!inTelegram && (
            <a
              href="/admin"
              className="self-center text-kiosk-sm font-bold text-teboil-muted underline underline-offset-4"
            >
              Панель оператора
            </a>
          )}
        </div>
      </div>
    </main>
  );
}

function Tile({
  tone,
  title,
  note,
  onClick,
}: {
  tone: 'red' | 'blue';
  title: string;
  note: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full px-5 py-6 text-left transition-colors',
        tone === 'red'
          ? 'bg-teboil-red active:bg-teboil-red-dark'
          : 'bg-teboil-blue active:bg-teboil-blue-80',
      )}
    >
      <span className="block font-display text-kiosk-lg font-bold leading-tight text-white">
        {title}
      </span>
      <span className="mt-1 block text-kiosk-sm font-medium leading-tight text-white">
        {note}
      </span>
    </button>
  );
}
