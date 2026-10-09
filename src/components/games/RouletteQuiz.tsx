'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { QuizVariant } from '@/lib/types';
import type { WheelSector } from './SpinWheel';
import { QuizButton, QuizScreen } from './quiz-ui';
import { QuizIntroScreen } from './QuizIntroScreen';
import { LevelPickScreen } from './LevelPickScreen';
import { WheelScreen } from './WheelScreen';
import { ThemePickScreen } from './ThemePickScreen';
import { QuestionScreen } from './QuestionScreen';
import { OutcomeScreen, TopicDoneScreen } from './QuizOutcome';
import { clearProgress, loadProgress, saveProgress } from './quiz-progress';
import {
  answerQuiz,
  completeQuiz,
  errorText,
  getQuiz,
  penaltyFor,
  trace,
  type CurrentPlayer,
  type QuizAnswerResponse,
  type QuizData,
  type QuizQuestionView,
} from './game-api';

/**
 * Квиз с рулеткой — главный магнит стенда.
 *
 * Путь участника: выбрать уровень → выбрать тему (колесом или руками) →
 * ответить на все вопросы этой темы → итог рубрики → снова тема или другой
 * уровень.
 *
 * Три правила, которые определяют этот файл:
 *
 *  1. Неверный ответ НЕ заканчивает игру. Участник стенда пришёл играть, а не
 *     сдавать экзамен: после ошибки он спокойно доигрывает оставшиеся вопросы
 *     рубрики. Цена у ошибки при этом есть — половина баллов уровня, — иначе
 *     выгодно тыкать наугад. Считает это сервер.
 *  2. Уровень выбирает участник, а не сценарий. Поэтому и колесо, и список тем
 *     собираются из вопросов ВЫБРАННОГО уровня.
 *  3. Повторный заход даёт другие вопросы: уже отвеченные сегодня приходят с
 *     сервера в `answeredIds` и исключаются, порядок тем перемешивается, а
 *     вопрос внутри темы берётся случайный.
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
  | 'levelPick'
  | 'wheel'
  | 'themes'
  | 'question'
  | 'topicDone';

/** Итог текущей рубрики — то, что показывается на экране между темами. */
interface TopicStats {
  asked: number;
  correct: number;
  earned: number;
}

const EMPTY_TOPIC: TopicStats = { asked: 0, correct: 0, earned: 0 };

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
  const [theme, setTheme] = useState<string | null>(null);
  const [question, setQuestion] = useState<QuizQuestionView | null>(null);
  const [askedIds, setAskedIds] = useState<string[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [result, setResult] = useState<QuizAnswerResponse | null>(null);
  const [busy, setBusy] = useState(false);

  /** Размер рубрики на момент её выбора — для полосы прогресса. */
  const [topicTotal, setTopicTotal] = useState(0);
  const [topic, setTopic] = useState<TopicStats>(EMPTY_TOPIC);
  /** Баллы за весь заход и бонус за три уровня, если он выдан именно сейчас. */
  const [points, setPoints] = useState(0);
  const [bonus, setBonus] = useState(0);

  /**
   * Порядок тем на колесе. Перемешивается один раз при загрузке: если тасовать
   * его на каждом рендере, сектора прыгали бы прямо во время вращения, а если
   * не тасовать вовсе — второй заход начинался бы с тех же тем.
   */
  const themeOrder = useRef(new Map<string, number>());

  /** Вынесено из эффекта, чтобы этим же путём работала кнопка «Попробовать снова». */
  const loadQuiz = useCallback(async () => {
    setError(null);
    const started = Date.now();
    try {
      const data = await getQuiz(variant, player.id);
      const questions = data.levels.reduce((n, l) => n + l.questions.length, 0);
      trace('quiz_loaded', { variant, questions, answered: data.answeredIds?.length ?? 0, fromCache: data.fromCache ?? false, ms: Date.now() - started });
      themeOrder.current = shuffledOrder(
        data.levels.flatMap((l) => l.questions.map((q) => q.theme)),
      );
      setQuiz(data);

      // Страницу перезагрузили посреди квиза — возвращаем участника туда, где
      // он остановился: тот же уровень, рубрика и вопрос.
      const saved = loadProgress(player.id, variant, data.fromCache ? undefined : data.epoch ?? null);
      setAskedIds([...new Set([...(data.answeredIds ?? []), ...(saved?.askedIds ?? [])])]);
      if (!saved) {
        setPhase('intro');
        return;
      }

      const current = saved.questionId
        ? data.levels.flatMap((l) => l.questions).find((q) => q.id === saved.questionId) ?? null
        : null;
      setLevel(saved.level);
      setTheme(saved.theme);
      setTopicTotal(saved.topicTotal);
      setTopic(saved.topic);
      setPoints(saved.points);
      setBonus(saved.bonus);
      setQuestion(current);
      setChosen(saved.result ? saved.chosen : null);
      setResult(saved.result);
      // Вопроса больше нет в банке — к выбору уровня, а не на пустой экран.
      const restoredPhase = saved.phase === 'question' && !current ? 'levelPick' : saved.phase;
      trace('quiz_restored', { variant, phase: restoredPhase, q: saved.questionId, answered: Boolean(saved.result) });
      setPhase(restoredPhase);
    } catch (e) {
      trace('quiz_load_fail', { variant, error: errorText(e), ms: Date.now() - started });
      setError(errorText(e));
    }
  }, [variant, player.id]);

  useEffect(() => {
    void loadQuiz();
  }, [loadQuiz]);

  // Запоминаем место после каждого шага. Выбранный вариант сохраняем только
  // вместе с ответом сервера: иначе перезагрузка в момент отправки оставила
  // бы вопрос с заблокированными кнопками.
  useEffect(() => {
    if (!quiz || phase === 'loading') return;
    saveProgress(player.id, variant, {
      epoch: quiz.epoch ?? null,
      phase,
      level,
      theme,
      questionId: question?.id ?? null,
      askedIds,
      chosen: result ? chosen : null,
      result,
      topicTotal,
      topic,
      points,
      bonus,
    });
  }, [quiz, phase, level, theme, question, askedIds, chosen, result, topicTotal, topic, points, bonus, player.id, variant]);

  /** Участник сам уходит из квиза — в следующий раз начнёт с заставки. */
  const leave = useCallback(() => {
    clearProgress(player.id, variant);
    onStations();
  }, [player.id, variant, onStations]);

  /** Ещё не отвеченные вопросы — по уровням. */
  const openByLevel = useMemo(() => {
    const out: Record<1 | 2 | 3, QuizQuestionView[]> = { 1: [], 2: [], 3: [] };
    for (const lvl of quiz?.levels ?? []) {
      out[lvl.level] = lvl.questions.filter((q) => !askedIds.includes(q.id));
    }
    return out;
  }, [quiz, askedIds]);

  const available = openByLevel[level];

  const levelCounts = useMemo(
    () => ({
      1: openByLevel[1].length,
      2: openByLevel[2].length,
      3: openByLevel[3].length,
    }),
    [openByLevel],
  );

  /** Темы выбранного уровня, где ещё остались вопросы: и для колеса, и для списка. */
  const sectors: WheelSector[] = useMemo(() => {
    const seen = new Set<string>();
    const out: WheelSector[] = [];
    for (const q of available) {
      if (seen.has(q.theme)) continue;
      seen.add(q.theme);
      out.push({ id: q.theme, label: q.theme });
    }
    return out.sort(
      (a, b) =>
        (themeOrder.current.get(a.id) ?? 0) - (themeOrder.current.get(b.id) ?? 0),
    );
  }, [available]);

  /** Случайный вопрос из указанной темы текущего уровня. */
  const takeQuestion = useCallback(
    (themeId: string): QuizQuestionView | null => {
      const pool = available.filter((q) => q.theme === themeId);
      if (pool.length === 0) return null;
      return pool[Math.floor(Math.random() * pool.length)] ?? pool[0];
    },
    [available],
  );

  /** Тема выбрана — колесом или руками. Рубрика начинается заново. */
  const startTopic = useCallback(
    (sector: WheelSector) => {
      const picked = takeQuestion(sector.id);
      if (!picked) return;

      setTheme(sector.id);
      setTopicTotal(available.filter((q) => q.theme === sector.id).length);
      setTopic(EMPTY_TOPIC);
      setBonus(0);
      setQuestion(picked);
      setChosen(null);
      setResult(null);
      setError(null);
      setPhase('question');
      trace('topic_start', { variant, level, theme: sector.id, q: picked.id });
    },
    [available, takeQuestion, variant, level],
  );

  function pickLevel(next: 1 | 2 | 3) {
    trace('level_pick', { variant, level: next, left: openByLevel[next].length });
    setLevel(next);
    setTheme(null);
    setQuestion(null);
    setTopic(EMPTY_TOPIC);
    setBonus(0);
    setPhase('wheel');
  }

  async function answer(index: number) {
    if (!question || busy || chosen !== null) return; // защита от двойного тапа
    setBusy(true);
    setChosen(index);
    const started = Date.now();
    try {
      const res = await answerQuiz({
        playerId: player.id,
        variant,
        questionId: question.id,
        answerIndex: index,
        // Ставки в потоке больше нет: уровень выбирает участник, а сгорающие
        // призы противоречили бы правилу «ошибка не заканчивает игру».
        bet: false,
      });
      setResult(res);
      setAskedIds((prev) => [...prev, question.id]);
      setPoints((p) => p + res.points);
      setTopic((t) => ({
        asked: t.asked + 1,
        correct: t.correct + (res.correct ? 1 : 0),
        earned: t.earned + res.points,
      }));
      if (res.totalPoints !== null && res.todayPoints !== null) {
        onPoints(res.totalPoints, res.todayPoints);
      }
      // Медленный ответ на вопрос — то, что человек чувствует как «зависло».
      if (Date.now() - started > 3000) trace('answer_slow', { q: question.id, ms: Date.now() - started });
    } catch (e) {
      trace('answer_fail', { variant, q: question.id, error: errorText(e), ms: Date.now() - started });
      setError(errorText(e));
      setChosen(null);
    } finally {
      setBusy(false);
    }
  }

  /**
   * «Далее» после ответа — верного или нет. Пока в рубрике есть вопросы,
   * ведём к следующему; когда кончились, показываем итог рубрики и просим
   * сервер проверить бонус за все три уровня.
   */
  async function next() {
    if (busy || !result || !theme) return;

    const following = takeQuestion(theme);
    if (following) {
      setQuestion(following);
      setChosen(null);
      setResult(null);
      setError(null);
      return;
    }

    setBusy(true);
    try {
      const done = await completeQuiz(player.id, variant);
      if (done.awarded) {
        setBonus(done.bonus);
        setPoints((p) => p + done.bonus);
        onPoints(done.totalPoints, done.todayPoints);
      }
    } catch (e) {
      trace('quiz_bonus_fail', { variant, error: errorText(e) });
      // Бонус — приятное дополнение, а не условие продолжения игры: если
      // запрос не прошёл, итог рубрики всё равно должен открыться. Сервер
      // выдаст бонус на следующей рубрике, он считается по журналу.
    } finally {
      setBusy(false);
      setPhase('topicDone');
    }
  }

  const score = player.todayPoints;

  if (!quiz) {
    // Из состояния ошибки обязательно должен быть выход. Киоск передают из рук
    // в руки: без кнопки участник упирается в тупик и зовёт волонтёра, а тот
    // может только перезагрузить страницу.
    return (
      <QuizScreen points={score}>
        <p className="mt-16 text-center text-kiosk-base font-medium text-white">
          {error ? 'Не удалось загрузить вопросы' : 'Загружаем вопросы…'}
        </p>

        {error && (
          <>
            <p className="mt-3 text-center text-kiosk-sm font-medium text-white/80">
              {error}
            </p>
            <div className="mt-auto flex flex-col items-center gap-4 pt-10">
              <QuizButton onClick={() => void loadQuiz()}>
                Попробовать снова
              </QuizButton>
              <QuizButton tone="pale" onClick={leave}>
                К станциям
              </QuizButton>
            </div>
          </>
        )}
      </QuizScreen>
    );
  }

  const levelPick = (
    <LevelPickScreen
      points={score}
      quiz={quiz}
      available={levelCounts}
      onPick={pickLevel}
      onStations={leave}
    />
  );

  if (phase === 'intro') {
    return (
      <QuizIntroScreen
        variant={variant}
        quiz={quiz}
        points={score}
        onStart={() => setPhase('levelPick')}
        onStations={leave}
      />
    );
  }

  if (phase === 'levelPick') return levelPick;

  if (phase === 'themes') {
    return (
      <ThemePickScreen
        points={score}
        quiz={quiz}
        level={level}
        themes={sectors}
        onPick={startTopic}
        onBack={() => setPhase('levelPick')}
        onStations={leave}
      />
    );
  }

  if (phase === 'wheel') {
    // Вопросы уровня кончились — выбирать нечего, поэтому возвращаем участника
    // к выбору уровня. Пустое колесо было бы тупиком.
    if (sectors.length === 0) return levelPick;

    return (
      <WheelScreen
        points={score}
        sectors={sectors}
        onPick={startTopic}
        onChooseManually={() => setPhase('themes')}
        onBack={() => setPhase('levelPick')}
        onStations={leave}
      />
    );
  }

  if (phase === 'question' && question) {
    // Счётчик отвеченных растёт сразу после ответа, а вопрос на экране
    // остаётся тем же — пока он не сменился, полоса не должна уходить вперёд.
    const currentIndex = result ? Math.max(topic.asked - 1, 0) : topic.asked;

    return (
      <QuestionScreen
        points={score}
        variant={variant}
        question={question}
        level={level}
        levelPoints={quiz.rules.levelPoints[level]}
        penalty={penaltyFor(quiz.rules, level)}
        askedInTopic={currentIndex}
        topicTotal={topicTotal}
        chosen={chosen}
        result={result}
        busy={busy}
        error={error}
        nextLabel={topic.asked < topicTotal ? 'Следующий вопрос' : 'Итог рубрики'}
        onAnswer={(i) => void answer(i)}
        onNext={() => void next()}
        onStations={leave}
      />
    );
  }

  if (phase === 'topicDone' && theme) {
    // Все вопросы всех уровней разобраны — дальше играть нечем, и честнее
    // сказать об этом прямо, чем вести на экран выбора без вариантов.
    if (levelCounts[1] + levelCounts[2] + levelCounts[3] === 0) {
      return (
        <OutcomeScreen
          points={score}
          title="Вопросы закончились"
          lines={[
            'Ты ответил на все вопросы этого квиза.',
            `Заработано за заход: ${points} баллов`,
            'Попробуй второй квиз или спортивные станции.',
          ]}
          onStations={leave}
        />
      );
    }

    return (
      <TopicDoneScreen
        points={score}
        variant={variant}
        level={level}
        theme={theme}
        correct={topic.correct}
        asked={topic.asked}
        earned={topic.earned}
        bonus={bonus}
        themesLeft={sectors.length > 0}
        onAnotherTheme={() => setPhase('wheel')}
        onChangeLevel={() => setPhase('levelPick')}
        onStations={leave}
      />
    );
  }

  // Сюда попадаем, только если вопрос не успел проставиться, — возвращаем
  // участника к выбору уровня, а не показываем ему чужой экран итога.
  return levelPick;
}

/**
 * Случайный, но фиксированный порядок тем: тема → её место в списке.
 * Тасуем перемешиванием Фишера—Йетса, а не `sort(() => Math.random() - 0.5)`:
 * второе даёт заметно неравномерный результат и первая тема выпадала бы чаще.
 */
function shuffledOrder(themes: string[]): Map<string, number> {
  const unique = [...new Set(themes)];
  for (let i = unique.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [unique[i], unique[j]] = [unique[j], unique[i]];
  }
  return new Map(unique.map((theme, index) => [theme, index]));
}
