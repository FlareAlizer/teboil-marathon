'use client';

import { useEffect, useState } from 'react';
import type { QuizVariant } from '@/lib/types';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui';
import { AppHeader } from './stations/AppHeader';
import { StationsScreen } from './stations/StationsScreen';
import {
  clearPlayer,
  loadPlayer,
  savePlayer,
  trace,
  type CurrentPlayer,
} from './game-api';
import { HOUR, clearState, loadState, saveState } from '@/lib/persist';
import { clearProgress } from './quiz-progress';
import { LoginScreen } from './LoginScreen';
import { RouletteQuiz } from './RouletteQuiz';
import { QuizPickScreen } from './QuizPickScreen';
import { SportsShowcase } from './SportsShowcase';

type Screen =
  | 'menu'
  | 'stations'
  | 'quizPick'
  | 'quiz'
  | 'sports';

const SCREENS: readonly Screen[] = ['menu', 'stations', 'quizPick', 'quiz', 'sports'];

/** Где участник был до перезагрузки. Три часа: вчерашний экран возвращать незачем. */
const NAV_KEY = 'teboil.nav';
const NAV_AGE = 3 * HOUR;

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

  /**
   * Возвращает участника на экран, где он был до перезагрузки страницы.
   * Сам квиз дальше восстановит уровень, рубрику и вопрос (quiz-progress.ts).
   */
  function restoreNav() {
    const nav = loadState<{ screen: Screen; variant: QuizVariant }>(NAV_KEY, NAV_AGE);
    if (!nav || !SCREENS.includes(nav.screen)) return;
    setScreen(nav.screen);
    if (nav.variant === 'v1' || nav.variant === 'v2') setVariant(nav.variant);
  }

  useEffect(() => {
    // Участник берётся из памяти устройства — без сервера. Поэтому
    // перезагрузка страницы или обрыв сети не выбрасывают на экран входа.
    const saved = loadPlayer();
    // Отметка «приложение запустилось»: страницу сервер отдаёт всегда, а вот
    // дошли ли до телефона скрипты, по журналу иначе не понять.
    trace(saved ? 'start_saved' : 'start_new');
    setPlayer(saved);
    if (saved) restoreNav();
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- только при первом открытии
  }, []);

  // Запоминаем экран при каждом переходе.
  useEffect(() => {
    if (ready && player) saveState(NAV_KEY, { screen, variant });
  }, [ready, player, screen, variant]);

  function updatePoints(totalPoints: number, todayPoints: number) {
    setPlayer((p) => {
      if (!p) return p;
      const next = { ...p, totalPoints, todayPoints };
      savePlayer(next);
      return next;
    });
  }

  function finish() {
    // Следующий участник начинает с чистого листа: ни чужого экрана, ни чужого места в квизе.
    if (player) clearProgress(player.id);
    clearState(NAV_KEY);
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

          <Button variant="danger" size="md" fullWidth onClick={onFinish}>
            Следующий участник
          </Button>

          {/* Вход для волонтёра — тот же, что на экране входа. */}
          <a
            href="/admin"
            className="self-center text-kiosk-sm font-bold text-teboil-muted underline underline-offset-4"
          >
            Панель оператора
          </a>
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
