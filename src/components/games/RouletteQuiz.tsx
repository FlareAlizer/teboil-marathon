'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { QuizVariant } from '@/lib/types';
import type { WheelSector } from './SpinWheel';
import { QuizScreen } from './quiz-ui';
import { QuizIntroScreen } from './QuizIntroScreen';
import { WheelScreen } from './WheelScreen';
import { ThemePickScreen } from './ThemePickScreen';
import { QuestionScreen } from './QuestionScreen';
import { StakeScreen, OutcomeScreen } from './QuizOutcome';
import {
  answerQuiz,
  completeQuiz,
  errorText,
  getQuiz,
  type CurrentPlayer,
  type QuizAnswerResponse,
  type QuizData,
  type QuizQuestionView,
} from './game-api';

/**
 * Квиз с рулеткой — главный магнит стенда.
 *
 * Три уровня подряд: Новичок → Любитель → Профи. Перед каждым уровнем тема
 * выбирается заново — колесом или руками из списка, — и показываются только
 * те темы, где на этом уровне ещё остались вопросы, так что мёртвых секторов
 * не бывает.
 *
 * Правильность ответа и баллы считает ТОЛЬКО сервер: экран не знает верного
 * варианта, пока участник не ответил, и не ведёт собственной арифметики баллов,
 * иначе на лидерборде могли бы оказаться другие числа.
 *
 * Этот файл — оркестратор: состояние и запросы здесь, вся вёрстка в отдельных
 * экранах рядом.
 */

type Phase =
  | 'loading'
  | 'intro'
  | 'wheel'
  | 'themes'
  | 'question'
  | 'stake'
  | 'won'
  | 'lost';

export function RouletteQuiz({
  variant,
  player,
  onPoints,
  onStations,
}: {
  variant: QuizVariant;
  player: CurrentPlayer;
  onPoints: (totalPoints: number, todayPoints: number) => void;
  onStations: () => void;
}) {
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);

  const [level, setLevel] = useState<1 | 2 | 3>(1);
  const [question, setQuestion] = useState<QuizQuestionView | null>(null);
  const [askedIds, setAskedIds] = useState<string[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [result, setResult] = useState<QuizAnswerResponse | null>(null);
  const [busy, setBusy] = useState(false);

  /** Заработанные призы: по одному за пройденный уровень. Сгорают при проигрыше со ставкой. */
  const [prizes, setPrizes] = useState(0);
  /** Призы поставлены на текущий уровень. */
  const [staked, setStaked] = useState(false);
  const [points, setPoints] = useState(0);
  const [bonus, setBonus] = useState(0);

  useEffect(() => {
    let alive = true;
    getQuiz(variant)
      .then((data) => {
        if (!alive) return;
        setQuiz(data);
        setPhase('intro');
      })
      .catch((e) => {
        if (!alive) return;
        setError(errorText(e));
      });
    return () => {
      alive = false;
    };
  }, [variant]);

  /** Ещё не заданные вопросы текущего уровня. */
  const available = useMemo(() => {
    if (!quiz) return [];
    const lvl = quiz.levels.find((l) => l.level === level);
    return (lvl?.questions ?? []).filter((q) => !askedIds.includes(q.id));
  }, [quiz, level, askedIds]);

  /** Темы, доступные на этом уровне: и для колеса, и для списка. */
  const sectors: WheelSector[] = useMemo(() => {
    const seen = new Set<string>();
    const out: WheelSector[] = [];
    for (const q of available) {
      if (seen.has(q.theme)) continue;
      seen.add(q.theme);
      out.push({ id: q.theme, label: q.theme });
    }
    return out;
  }, [available]);

  /** Тема выбрана — колесом или руками. Вопрос из неё берём случайный. */
  const pickQuestion = useCallback(
    (sector: WheelSector) => {
      const pool = available.filter((q) => q.theme === sector.id);
      const picked = pool[Math.floor(Math.random() * pool.length)] ?? pool[0];
      if (!picked) return;
      setQuestion(picked);
      setChosen(null);
      setResult(null);
      setError(null);
      setPhase('question');
    },
    [available],
  );

  async function answer(index: number) {
    if (!question || busy || chosen !== null) return; // защита от двойного тапа
    setBusy(true);
    setChosen(index);
    try {
      const res = await answerQuiz({
        playerId: player.id,
        variant,
        questionId: question.id,
        answerIndex: index,
        bet: staked,
      });
      setResult(res);
      setAskedIds((prev) => [...prev, question.id]);
      setPoints((p) => p + res.points);
      if (res.totalPoints !== null && res.todayPoints !== null) {
        onPoints(res.totalPoints, res.todayPoints);
      }
      if (!res.correct && res.prizesLost) setPrizes(0);
    } catch (e) {
      setError(errorText(e));
      setChosen(null);
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    if (busy || !result) return;
    setBusy(true);
    try {
      if (!result.correct) {
        setPhase('lost');
        return;
      }
      const wonPrizes = prizes + 1;
      setPrizes(wonPrizes);
      setStaked(false);

      if (level === 3) {
        const done = await completeQuiz(player.id, variant);
        setBonus(done.bonus);
        if (done.awarded) {
          setPoints((p) => p + done.bonus);
          onPoints(done.totalPoints, done.todayPoints);
        }
        setPhase('won');
        return;
      }
      setPhase('stake');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function toNextLevel(withStake: boolean) {
    setStaked(withStake);
    setLevel((l) => (l === 1 ? 2 : 3));
    setQuestion(null);
    setChosen(null);
    setResult(null);
    setPhase('wheel');
  }

  const score = player.todayPoints;

  if (!quiz) {
    return (
      <QuizScreen points={score}>
        <p className="mt-16 text-center text-kiosk-base font-medium text-white">
          {error ?? 'Загружаем вопросы…'}
        </p>
      </QuizScreen>
    );
  }

  const levelIndex = quiz.levels.findIndex((l) => l.level === level);

  if (phase === 'intro') {
    return (
      <QuizIntroScreen
        variant={variant}
        quiz={quiz}
        points={score}
        onStart={() => setPhase('wheel')}
        onStations={onStations}
      />
    );
  }

  if (phase === 'themes') {
    return (
      <ThemePickScreen
        points={score}
        quiz={quiz}
        themes={sectors}
        onPick={pickQuestion}
        onStations={onStations}
      />
    );
  }

  if (phase === 'wheel') {
    // Вопросы уровня кончились — тем для выбора не осталось.
    if (sectors.length === 0) {
      return (
        <OutcomeScreen
          points={score}
          title="Вопросы закончились"
          lines={[`Заработано за попытку: ${points} баллов`]}
          onStations={onStations}
        />
      );
    }
    return (
      <WheelScreen
        points={score}
        sectors={sectors}
        onPick={pickQuestion}
        onChooseManually={() => setPhase('themes')}
        onStations={onStations}
      />
    );
  }

  if (phase === 'question' && question) {
    return (
      <QuestionScreen
        points={score}
        question={question}
        levelIndex={levelIndex < 0 ? 0 : levelIndex}
        levelCount={quiz.levels.length}
        chosen={chosen}
        result={result}
        busy={busy}
        error={error}
        onAnswer={(i) => void answer(i)}
        onNext={() => void next()}
        onStations={onStations}
      />
    );
  }

  if (phase === 'stake') {
    return (
      <StakeScreen
        points={score}
        nextLevel={level === 1 ? 2 : 3}
        prizes={prizes}
        multiplier={quiz.rules.betMultiplier}
        onChoose={toNextLevel}
      />
    );
  }

  if (phase === 'won') {
    return (
      <OutcomeScreen
        points={score}
        title="Главный приз!"
        lines={[
          'Пройдены все три уровня.',
          bonus > 0 ? `Бонус за полный проход: +${bonus}` : '',
          `Всего за попытку: ${points} баллов`,
          'Покажи этот экран волонтёру.',
        ]}
        onStations={onStations}
      />
    );
  }

  if (phase === 'lost') {
    return (
      <OutcomeScreen
        points={score}
        title="Попытка окончена"
        lines={[
          result?.prizesLost
            ? 'Ставка не сыграла — призы сгорели, но баллы остались за тобой.'
            : 'Баллы за пройденные уровни остаются за тобой.',
          `Заработано: ${points} баллов`,
        ]}
        onStations={onStations}
      />
    );
  }

  // Сюда попадаем, только если вопрос не успел проставиться, — возвращаем
  // участника к выбору темы, а не показываем ему чужой экран итога.
  return (
    <QuizScreen points={score}>
      <p className="mt-16 text-center text-kiosk-base font-medium text-white">
        Готовим вопрос…
      </p>
    </QuizScreen>
  );
}
