'use client';

import type { QuizVariant } from '@/lib/types';
import { cn } from '@/lib/cn';
import { QuizButton, QuizScreen, RowPlate, ScreenTitle } from './quiz-ui';
import {
  INTRO_DIFFICULTY_LABELS,
  LEVEL_TONES,
  levelNote,
} from './quiz-levels';
import type { QuizData } from './game-api';

/**
 * Описание квиза перед стартом — макеты 37:64 (квиз 1) и 37:137 (квиз 2).
 *
 * Оба экрана показывают одно и то же: во что играем и сколько стоит верный
 * ответ на каждом уровне. Отличается подача — у первого квиза это три белые
 * карточки «Легкие / Средние / Сложные», у второго — список уровней с
 * названиями. Числа баллов НЕ зашиты: они приходят в `quiz.rules.levelPoints`
 * из `/api/quiz`, чтобы экран не разошёлся с тем, что реально начислит сервер.
 */

/*
 * Подписи и цвета уровней лежат в `quiz-levels`: те же цвета стоят на экране
 * выбора уровня и на самом вопросе, и разъехавшись здесь они сломали бы
 * цветовую метку целиком.
 */

export function QuizIntroScreen({
  variant,
  quiz,
  points,
  onStart,
  onStations,
}: {
  variant: QuizVariant;
  quiz: QuizData;
  points: number;
  onStart: () => void;
  onStations: () => void;
}) {
  const themeCount = new Set(
    quiz.levels.flatMap((level) => level.questions.map((q) => q.theme)),
  ).size;

  return (
    <QuizScreen points={points}>
      {variant === 'v1' ? (
        <>
          <ScreenTitle
            title={`Квизы. ${themeCount} рубрик о беге`}
            subtitle="Выбирай уровень и рубрику. Верный ответ приносит баллы, неверный — снимает половину: игра на этом не заканчивается."
          />
          <DifficultyCards quiz={quiz} />
        </>
      ) : (
        <>
          <ScreenTitle
            title="Гонка чемпионов"
            subtitle="Твой организм — двигатель, трасса — марафон. Верный ответ приносит баллы, неверный — снимает половину."
          />
          <LevelPlates quiz={quiz} />
        </>
      )}

      <div className="mt-auto flex flex-col items-center gap-4 pt-10">
        <QuizButton onClick={onStart}>Начать квиз</QuizButton>
        <QuizButton tone="pale" onClick={onStations}>
          К станциям
        </QuizButton>
      </div>
    </QuizScreen>
  );
}

/** Три белые карточки со стоимостью уровня — макет 37:64. */
function DifficultyCards({ quiz }: { quiz: QuizData }) {
  return (
    <ul className="flex gap-3">
      {quiz.levels.map((level) => (
        <li
          key={level.level}
          className="flex h-[92px] flex-1 flex-col items-center justify-center bg-white"
        >
          {/* В макете подпись светло-синяя (#99AFDF), но на белой карточке
              это 2.2:1 — ниже даже порога 3:1 для крупного текста. Берём
              системный «текст на белом» (5.9:1): подпись остаётся
              подчинённой числу, но её видно. */}
          <span className="font-display text-kiosk-sm font-bold text-teboil-muted">
            {INTRO_DIFFICULTY_LABELS[level.level]}
          </span>
          <span
            className={cn(
              'mt-1 font-display text-kiosk-lg font-bold',
              LEVEL_TONES[level.level].textOnLight,
            )}
          >
            +{quiz.rules.levelPoints[level.level]}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Список уровней с названиями и баллами — макет 37:137. */
function LevelPlates({ quiz }: { quiz: QuizData }) {
  return (
    <ul className="space-y-3">
      {quiz.levels.map((level) => (
        <li key={level.level}>
          <RowPlate
            badge={level.level}
            badgeTone={level.level === 3 ? 'red' : 'pale'}
            title={level.title}
            note={levelNote(quiz.variant, level.level)}
            trailing={
              <span
                className={cn(
                  'shrink-0 font-display text-kiosk-lg font-bold',
                  level.level === 3 ? 'text-teboil-red-80' : 'text-teboil-red-40',
                )}
              >
                +{quiz.rules.levelPoints[level.level]}
              </span>
            }
          />
        </li>
      ))}
    </ul>
  );
}
