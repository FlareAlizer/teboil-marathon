'use client';

import { cn } from '@/lib/cn';
import type { QuizVariant } from '@/lib/types';
import { QuizButton, QuizScreen } from './quiz-ui';
import { LEVEL_TONES, levelLabel } from './quiz-levels';

/**
 * Экраны между рубриками и в конце попытки.
 *
 * В дизайн-буке их нет — там нарисован только основной путь, — поэтому они
 * собраны из тех же блоков и приведены к фирменной светлой теме.
 *
 * Экрана ставки здесь больше нет: он существовал только на переходе
 * «уровень пройден → следующий уровень», а уровень теперь выбирает сам
 * участник, и сгорающие призы противоречат правилу «неверный ответ не
 * заканчивает игру». Серверная механика ставки не тронута (см. scoring.ts),
 * клиент просто всегда отвечает без неё.
 */

/**
 * Итог рубрики: сколько верных из скольких и сколько это дало баллов.
 *
 * Отсюда всегда есть три выхода — та же рубрика кончилась, но игра нет:
 * взять другую тему на том же уровне, сменить уровень или уйти к станциям.
 */
export function TopicDoneScreen({
  points,
  variant,
  level,
  theme,
  correct,
  asked,
  earned,
  bonus,
  themesLeft,
  onAnotherTheme,
  onChangeLevel,
  onStations,
}: {
  points: number;
  variant: QuizVariant;
  level: 1 | 2 | 3;
  theme: string;
  correct: number;
  asked: number;
  earned: number;
  /** Бонус за все три уровня, если сервер начислил его именно сейчас. */
  bonus: number;
  /** Остались ли на этом уровне другие темы. */
  themesLeft: boolean;
  onAnotherTheme: () => void;
  onChangeLevel: () => void;
  onStations: () => void;
}) {
  const tone = LEVEL_TONES[level];

  return (
    <QuizScreen points={points}>
      <p className={cn('mb-2 font-display text-kiosk-sm font-bold', tone.text)}>
        {levelLabel(variant, level)} · {theme}
      </p>
      <h1 className="mb-7 font-display text-[2rem] font-black leading-tight text-white">
        {correct === asked ? 'Рубрика взята!' : 'Рубрика пройдена'}
      </h1>

      <div className="space-y-3 bg-teboil-blue-80 p-5">
        <Line label="Верных ответов" value={`${correct} из ${asked}`} />
        <Line label="Баллов за рубрику" value={signed(earned)} />
        {bonus > 0 && (
          <Line label="Бонус за все три уровня" value={`+${bonus}`} accent />
        )}
      </div>

      <div className="mt-auto flex flex-col items-center gap-4 pt-10">
        {themesLeft && (
          <QuizButton onClick={onAnotherTheme}>Ещё тема</QuizButton>
        )}
        <QuizButton tone={themesLeft ? 'pale' : 'red'} onClick={onChangeLevel}>
          Сменить уровень
        </QuizButton>
        <QuizButton tone="pale" onClick={onStations}>
          К станциям
        </QuizButton>
      </div>
    </QuizScreen>
  );
}

/** «+30», «0», «−10»: знак минуса показываем честно, а не прячем. */
function signed(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return '0';
}

function Line({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <p className="flex items-baseline justify-between gap-4 text-white">
      <span className="text-kiosk-sm font-medium">{label}</span>
      <span
        className={cn(
          'shrink-0 font-display text-kiosk-lg font-bold',
          accent && 'text-teboil-correct-60',
        )}
      >
        {value}
      </span>
    </p>
  );
}

/** Итог попытки: вопросы кончились или участник дошёл до конца. */
export function OutcomeScreen({
  points,
  title,
  lines,
  onStations,
}: {
  points: number;
  title: string;
  lines: string[];
  onStations: () => void;
}) {
  return (
    <QuizScreen points={points}>
      <h1 className="mb-7 font-display text-[2rem] font-black leading-tight text-white">
        {title}
      </h1>

      <div className="space-y-3">
        {lines
          .filter(Boolean)
          .map((line, index) => (
            <p key={index} className="text-kiosk-base font-medium text-white">
              {line}
            </p>
          ))}
      </div>

      <div className="mt-auto flex justify-center pt-10">
        <QuizButton onClick={onStations}>К станциям</QuizButton>
      </div>
    </QuizScreen>
  );
}
