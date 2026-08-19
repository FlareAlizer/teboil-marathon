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
  loadPlayer,
  login,
  savePlayer,
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

  useEffect(() => {
    setPlayer(loadPlayer());
    setReady(true);
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

function LoginScreen({ onLogin }: { onLogin: (p: CurrentPlayer) => void }) {
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

      <div className="flex flex-1 flex-col justify-center px-5 pb-10 pt-8">
        <h1 className="mb-4 font-display text-[2rem] font-black leading-tight text-teboil-black">
          Твой <span className="text-teboil-red">юзернейм</span> в Телеграме
        </h1>
        <p className="mb-8 text-kiosk-sm font-medium leading-snug text-teboil-muted">
          По нему начисляются баллы и выдаются призы. Этот же юзернейм ты
          назовёшь волонтёру на спортивных активностях.
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
          placeholder="@running_fox"
          maxLength={33}
          disabled={busy}
        />

        <p className="mt-6 text-kiosk-sm font-medium leading-snug text-teboil-muted">
          Уже играл сегодня? Введи тот же юзернейм — баллы сохранятся.
          <br />
          Нет юзернейма в Телеграме? Подойди к волонтёру, он тебя запишет.
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
            note="Восемь рубрик о беге и гонка чемпионов"
            onClick={() => onGo('quizPick')}
          />
          {/* В макете на главном ровно две большие плитки: «Квизы» и
              «Эстафета». Эстафета — витрина станций: замер времени делает
              волонтёр, баллы заводит оператор. */}
          <Tile
            tone="blue"
            title="Эстафета"
            note="Чеканка, полоса, гол, дартс"
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
