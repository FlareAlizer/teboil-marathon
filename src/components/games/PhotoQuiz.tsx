'use client';

import { useEffect, useState } from 'react';
import type { PublicPhotoQuestion } from '@/lib/types';
import { cn } from '@/lib/cn';
import { ErrorNote, QuizButton, QuizScreen } from './quiz-ui';
import {
  checkPhotoAnswer,
  errorText,
  getPhotoQuestions,
  type CurrentPlayer,
  type PhotoCheckResponse,
} from './game-api';

const LETTERS = ['А', 'Б', 'В', 'Г'];

/**
 * Квиз «Угадай по фото».
 *
 * Вопросы заводит оператор через админку, поэтому экран обязан выглядеть
 * осмысленно и когда их ещё нет. Ответ проверяет сервер — правильный вариант
 * не приходит на планшет заранее, и баллы тоже приходят с сервера.
 */
export function PhotoQuiz({
  player,
  onPoints,
  onExit,
}: {
  player: CurrentPlayer;
  onPoints: (totalPoints: number, todayPoints: number) => void;
  onExit: () => void;
}) {
  const [questions, setQuestions] = useState<PublicPhotoQuestion[] | null>(null);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [result, setResult] = useState<PhotoCheckResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getPhotoQuestions()
      .then((list) => alive && setQuestions(list))
      .catch((e) => {
        if (!alive) return;
        setError(errorText(e));
        setQuestions([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const current = questions?.[index] ?? null;

  async function answer(i: number) {
    if (!current || busy || chosen !== null) return; // защита от двойного тапа
    setBusy(true);
    setChosen(i);
    try {
      const res = await checkPhotoAnswer({
        playerId: player.id,
        questionId: current.id,
        answerIndex: i,
      });
      setResult(res);
      onPoints(res.totalPoints, res.todayPoints);
    } catch (e) {
      setError(errorText(e));
      setChosen(null);
    } finally {
      setBusy(false);
    }
  }

  function next() {
    setChosen(null);
    setResult(null);
    setError(null);
    setIndex((i) => i + 1);
  }

  if (questions === null) {
    // Выход есть и на загрузке: если сеть подвиснет, ответ не придёт никогда,
    // и без кнопки участник останется на этом экране навсегда.
    return (
      <QuizScreen points={player.todayPoints}>
        <p className="mt-16 text-center text-kiosk-base font-medium text-white">
          Загружаем…
        </p>
        <div className="mt-auto flex justify-center pt-10">
          <QuizButton tone="pale" onClick={onExit}>
            К станциям
          </QuizButton>
        </div>
      </QuizScreen>
    );
  }

  if (!current) {
    const empty = questions.length === 0;
    return (
      <QuizScreen points={player.todayPoints}>
        <h1 className="mb-4 font-display text-[2rem] font-black leading-tight text-white">
          {empty ? 'Скоро будет' : 'Вопросы закончились'}
        </h1>
        <p className="text-kiosk-base font-medium leading-snug text-white">
          {empty
            ? 'Вопросы пока не добавлены. Попробуй квиз с рулеткой — там уже всё готово.'
            : 'Ты прошёл весь фото-квиз. Загляни на другие активности стенда.'}
        </p>
        <div className="mt-auto flex justify-center pt-10">
          <QuizButton onClick={onExit}>К станциям</QuizButton>
        </div>
      </QuizScreen>
    );
  }

  return (
    <QuizScreen
      points={player.todayPoints}
      footer={
        result ? (
          <QuizButton tone="red-soft" onClick={next}>
            {index + 1 < questions.length ? 'Следующее фото' : 'Завершить'}
          </QuizButton>
        ) : (
          <QuizButton tone="blue-soft" onClick={onExit}>
            К станциям
          </QuizButton>
        )
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={current.imagePath}
        alt=""
        className="mb-5 max-h-[34dvh] w-full object-cover"
      />
      <h1 className="mb-6 font-display text-kiosk-lg font-medium leading-snug text-white">
        {current.question}
      </h1>

      {error && <ErrorNote>{error}</ErrorNote>}

      <ul className="space-y-4">
        {current.options.map((option, i) => {
          const isChosen = chosen === i;
          const isCorrect = result !== null && result.correctIndex === i;
          const showWrong = result !== null && isChosen && !result.correct;

          let row = 'bg-teboil-blue-80';
          let badge = 'bg-teboil-blue-60 text-white';
          if (isCorrect) {
            row = 'bg-teboil-correct';
            badge = 'bg-white text-teboil-correct';
          } else if (showWrong) {
            row = 'bg-teboil-red';
            badge = 'bg-white text-teboil-red';
          } else if (isChosen) {
            row = 'bg-teboil-blue-60';
            badge = 'bg-white text-teboil-blue';
          }

          return (
            <li key={i}>
              <button
                type="button"
                disabled={chosen !== null || busy}
                onClick={() => void answer(i)}
                className={cn(
                  'flex min-h-[80px] w-full items-center gap-6 px-4 py-3 text-left',
                  'transition-colors disabled:cursor-default',
                  row,
                )}
              >
                <span
                  className={cn(
                    'flex h-[50px] w-[50px] shrink-0 items-center justify-center',
                    'font-display text-kiosk-lg font-bold',
                    badge,
                  )}
                >
                  {LETTERS[i] ?? i + 1}
                </span>
                <span className="min-w-0 text-kiosk-sm font-bold leading-snug text-white">
                  {option}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {result && (
        <p
          className={cn(
            'mt-7 text-center font-display text-kiosk-xl font-black',
            result.correct ? 'text-teboil-correct-60' : 'text-teboil-red-60',
          )}
        >
          {result.correct ? `Верно! +${result.points}` : 'Не угадал'}
        </p>
      )}
    </QuizScreen>
  );
}
