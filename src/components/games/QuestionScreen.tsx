'use client';

import { cn } from '@/lib/cn';
import type { QuizVariant } from '@/lib/types';
import { ErrorNote, QuizButton, QuizScreen } from './quiz-ui';
import { LEVEL_TONES, LevelBadge } from './quiz-levels';
import type { QuizAnswerResponse, QuizQuestionView } from './game-api';

const LETTERS = ['А', 'Б', 'В', 'Г'];

/**
 * Экран вопроса и состояния ответа — макеты 38:201, 39:569, 39:668, 49:206.
 *
 * Экран НЕ знает правильного ответа, пока участник не ответил: `result`
 * приходит с сервера после запроса, и до этого подсветить верный вариант
 * попросту нечем. Баллы за ответ тоже берутся из ответа сервера (`result.points`),
 * на клиенте они не считаются.
 *
 * Уровень помечен цветом и ценой ответа СВЕРХУ, до ответа: раньше участник
 * узнавал стоимость вопроса только постфактум.
 *
 * Повторный тап по варианту невозможен: как только `chosen` не null, все
 * кнопки отключены — иначе двойное касание отправило бы второй запрос.
 */
export function QuestionScreen({
  points,
  variant,
  question,
  level,
  levelPoints,
  penalty,
  askedInTopic,
  topicTotal,
  chosen,
  result,
  busy,
  error,
  nextLabel,
  onAnswer,
  onNext,
  onStations,
}: {
  points: number;
  variant: QuizVariant;
  question: QuizQuestionView;
  level: 1 | 2 | 3;
  /** Сколько даёт верный ответ на этом уровне — из правил сервера. */
  levelPoints: number;
  /** Сколько снимется за ошибку. */
  penalty: number;
  /** Номер текущего вопроса в рубрике, считая с нуля. */
  askedInTopic: number;
  topicTotal: number;
  chosen: number | null;
  result: QuizAnswerResponse | null;
  busy: boolean;
  error: string | null;
  /** Подпись кнопки продолжения: следующий вопрос или итог рубрики. */
  nextLabel: string;
  onAnswer: (index: number) => void;
  onNext: () => void;
  onStations: () => void;
}) {
  return (
    <QuizScreen
      points={points}
      footer={
        <>
          <QuizButton
            tone="red-soft"
            onClick={onNext}
            disabled={result === null || busy}
          >
            {nextLabel}
          </QuizButton>
          <QuizButton tone="blue-soft" onClick={onStations}>
            К станциям
          </QuizButton>
        </>
      }
    >
      <Progress current={askedInTopic} total={topicTotal} level={level} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-kiosk-sm font-bold text-white">{question.theme}</p>
        <LevelBadge
          variant={variant}
          level={level}
          points={levelPoints}
          penalty={penalty}
        />
      </div>

      <h1 className="mb-7 font-display text-kiosk-lg font-medium leading-snug text-white">
        {question.question}
      </h1>

      {error && <ErrorNote>{error}</ErrorNote>}

      <ul className="space-y-4">
        {question.options.map((option, index) => (
          <li key={index}>
            <Option
              letter={LETTERS[index] ?? String(index + 1)}
              text={option}
              state={optionState(index, chosen, result)}
              disabled={chosen !== null || busy}
              onClick={() => onAnswer(index)}
            />
          </li>
        ))}
      </ul>

      {result && <Feedback result={result} options={question.options} />}
    </QuizScreen>
  );
}

/* -------------------------------- Состояния -------------------------------- */

type OptionState = 'idle' | 'chosen' | 'correct' | 'wrong';

/**
 * Каким показать вариант. Пока сервер не ответил, «выбранный» — единственное
 * доступное состояние: правильного варианта экран ещё не знает.
 */
function optionState(
  index: number,
  chosen: number | null,
  result: QuizAnswerResponse | null,
): OptionState {
  if (result === null) return chosen === index ? 'chosen' : 'idle';
  if (result.correctIndex === index) return 'correct';
  if (chosen === index) return 'wrong';
  return 'idle';
}

const OPTION_STYLES: Record<OptionState, { row: string; badge: string }> = {
  idle: { row: 'bg-teboil-blue-80', badge: 'bg-teboil-blue-60' },
  chosen: { row: 'bg-teboil-blue-60', badge: 'bg-white text-teboil-blue' },
  correct: { row: 'bg-teboil-correct', badge: 'bg-white text-teboil-correct' },
  wrong: { row: 'bg-teboil-red', badge: 'bg-white text-teboil-red' },
};

function Option({
  letter,
  text,
  state,
  disabled,
  onClick,
}: {
  letter: string;
  text: string;
  state: OptionState;
  disabled: boolean;
  onClick: () => void;
}) {
  const style = OPTION_STYLES[state];

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex min-h-[80px] w-full items-center gap-6 px-4 py-3 text-left',
        'transition-colors disabled:cursor-default',
        style.row,
      )}
    >
      <span
        className={cn(
          'flex h-[50px] w-[50px] shrink-0 items-center justify-center',
          'font-display text-kiosk-lg font-bold text-white',
          style.badge,
        )}
      >
        {letter}
      </span>
      <span className="min-w-0 text-kiosk-sm font-bold leading-snug text-white">
        {text}
      </span>
    </button>
  );
}

/**
 * Итог ответа и брендовый факт. Баллы — те, что вернул сервер.
 *
 * Формулировка при ошибке намеренно мягкая и сразу говорит, что игра
 * продолжается: участник стенда не должен уходить с ощущением, что его
 * выгнали за один неверный ответ.
 */
function Feedback({
  result,
  options,
}: {
  result: QuizAnswerResponse;
  options: readonly string[];
}) {
  const correctText = options[result.correctIndex];
  const correctLetter = LETTERS[result.correctIndex] ?? String(result.correctIndex + 1);

  return (
    <div className="mt-7">
      <p
        className={cn(
          'mb-2 text-center font-display text-kiosk-xl font-black',
          result.correct ? 'text-teboil-correct-60' : 'text-teboil-red-60',
        )}
      >
        {result.correct
          ? `Верно! +${result.points}`
          : `Почти! ${result.points < 0 ? `−${Math.abs(result.points)}` : ''}`}
      </p>

      {!result.correct && (
        <p className="mb-4 text-center text-kiosk-sm font-medium text-white">
          Ничего страшного — играем дальше.
        </p>
      )}

      {/* Подпись «Правильно: Б) …» из макета. Показываем только при ошибке:
          если ответ верный, вариант и так подсвечен зелёным, и повтор
          выглядел бы шумом. */}
      {!result.correct && correctText && (
        <p className="mb-4 text-center text-kiosk-sm font-bold text-teboil-correct-60">
          Правильно: {correctLetter}) {correctText}
        </p>
      )}

      {result.fact && (
        <div className="bg-white p-5">
          <p className="mb-2 font-display text-kiosk-sm font-bold text-teboil-red">
            А знаешь ли ты…
          </p>
          <p className="text-kiosk-sm font-medium leading-snug text-teboil-black">
            {result.fact}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Полоса прогресса из скошенных сегментов (макет 38:201).
 *
 * Сегменты — это вопросы текущей рубрики, а не уровни: уровень участник
 * выбирает сам, поэтому «уровень 2 из 3» больше ничего не значило бы.
 * Цвет полосы — цвет выбранного уровня, та же метка, что и в бейдже.
 */
function Progress({
  current,
  total,
  level,
}: {
  current: number;
  total: number;
  level: 1 | 2 | 3;
}) {
  const safeTotal = Math.max(total, 1);

  return (
    <div
      className="mb-5 flex gap-[6px]"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={safeTotal}
      aria-valuenow={current + 1}
      aria-label={`Вопрос ${current + 1} из ${safeTotal}`}
    >
      {Array.from({ length: safeTotal }, (_, index) => (
        <span
          key={index}
          className={cn(
            'h-[14px] flex-1 skew-x-brand',
            index <= current ? LEVEL_TONES[level].bar : 'bg-teboil-blue-60',
          )}
        />
      ))}
    </div>
  );
}
