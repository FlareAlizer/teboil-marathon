'use client';

import { QuizButton, QuizScreen, ScreenTitle } from './quiz-ui';

/**
 * Экраны ставки и итога квиза.
 *
 * В дизайн-буке этих экранов нет — там нарисован только основной путь, — но
 * механика ставки уже работает и проверена на сервере, поэтому экраны оставлены
 * и приведены к фирменной светлой теме.
 */

/**
 * Экран ставки. Правило риска объясняется прямым текстом: участник должен
 * понимать, что теряет призы, но не баллы, — иначе решение нечестное.
 */
export function StakeScreen({
  points,
  nextLevel,
  prizes,
  multiplier,
  onChoose,
}: {
  points: number;
  nextLevel: 2 | 3;
  prizes: number;
  multiplier: number;
  onChoose: (withStake: boolean) => void;
}) {
  return (
    <QuizScreen points={points}>
      <ScreenTitle title={`Уровень ${nextLevel}. Рискнёшь?`} />

      <ul className="space-y-4 bg-teboil-blue-80 p-5">
        <Rule
          text={`Поставишь призы (${prizes} шт.) — баллы за уровень вырастут в ${multiplier} раза.`}
        />
        <Rule text="Ошибёшься со ставкой — призы сгорят." />
        <Rule text="Набранные баллы остаются за тобой в любом случае." accent />
      </ul>

      <div className="mt-auto flex flex-col items-center gap-4 pt-10">
        <QuizButton onClick={() => onChoose(true)}>Поставить призы</QuizButton>
        <QuizButton tone="pale" onClick={() => onChoose(false)}>
          Играть без ставки
        </QuizButton>
      </div>
    </QuizScreen>
  );
}

function Rule({ text, accent = false }: { text: string; accent?: boolean }) {
  return (
    <li className="flex gap-3 text-kiosk-sm leading-snug text-white">
      <span aria-hidden className="text-teboil-red-60">
        ▪
      </span>
      <span className={accent ? 'font-bold' : 'font-medium'}>{text}</span>
    </li>
  );
}

/** Итог попытки: выигрыш, проигрыш или закончившиеся вопросы. */
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
