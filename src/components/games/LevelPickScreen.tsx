'use client';

import { cn } from '@/lib/cn';
import { QuizButton, QuizScreen, ScreenTitle } from './quiz-ui';
import { LEVEL_TONES, levelLabel, levelNote } from './quiz-levels';
import { penaltyFor, type QuizData } from './game-api';

/**
 * Выбор уровня сложности перед рубрикой.
 *
 * До этого экрана уровни шли жёстко подряд (Новичок → Любитель → Профи), и
 * участник не мог начать с того, что ему по силам или наоборот интересно.
 * Теперь уровень выбирается руками, а колесо собирается из тем ВЫБРАННОГО
 * уровня — иначе выбор был бы декоративным.
 *
 * Баллы за уровень видны прямо здесь и берутся из `quiz.rules.levelPoints`:
 * раньше цена ответа выяснялась только постфактум.
 *
 * Уровень, где вопросы кончились, показывается неактивным, а не исчезает:
 * пропавшая строка выглядит как сбой, а подпись объясняет, что произошло.
 */
export function LevelPickScreen({
  points,
  quiz,
  available,
  onPick,
  onStations,
}: {
  points: number;
  quiz: QuizData;
  /** Сколько вопросов осталось на каждом уровне. */
  available: Record<1 | 2 | 3, number>;
  onPick: (level: 1 | 2 | 3) => void;
  onStations: () => void;
}) {
  return (
    <QuizScreen points={points}>
      <ScreenTitle
        title="Выбери уровень"
        subtitle="Чем сложнее вопрос, тем больше баллов за верный ответ — и тем дороже ошибка."
      />

      <ul className="space-y-4">
        {([1, 2, 3] as const).map((level) => {
          const left = available[level];
          const tone = LEVEL_TONES[level];

          return (
            <li key={level}>
              <button
                type="button"
                disabled={left === 0}
                onClick={() => onPick(level)}
                className={cn(
                  'flex w-full items-center gap-5 px-4 py-5 text-left transition-colors',
                  'bg-teboil-blue-80 active:bg-teboil-blue-60',
                  'disabled:opacity-50 disabled:active:bg-teboil-blue-80',
                )}
              >
                {/* Квадрат в цвете уровня — та же метка, что потом стоит на
                    экране вопроса, поэтому уровень узнаётся без чтения. */}
                <span
                  aria-hidden
                  className={cn(
                    'flex h-[60px] w-[65px] shrink-0 items-center justify-center',
                    'font-display text-kiosk-lg font-bold text-white',
                    tone.solid,
                  )}
                >
                  {level}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block font-display text-kiosk-lg font-bold leading-tight text-white">
                    {levelLabel(quiz.variant, level)}
                  </span>
                  <span className="mt-1 block text-kiosk-sm font-medium leading-tight text-white">
                    {left === 0
                      ? 'Вопросы этого уровня закончились'
                      : levelNote(quiz.variant, level)}
                  </span>
                </span>

                <span className="shrink-0 text-right">
                  <span
                    className={cn(
                      'block font-display text-kiosk-lg font-black',
                      tone.text,
                    )}
                  >
                    +{quiz.rules.levelPoints[level]}
                  </span>
                  {/* Цена ошибки стоит рядом с наградой: выбирать уровень
                      вслепую участник не должен. */}
                  <span className="block text-kiosk-sm font-bold text-teboil-red-60">
                    −{penaltyFor(quiz.rules, level)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto flex justify-center pt-10">
        <QuizButton tone="pale" onClick={onStations}>
          К станциям
        </QuizButton>
      </div>
    </QuizScreen>
  );
}
