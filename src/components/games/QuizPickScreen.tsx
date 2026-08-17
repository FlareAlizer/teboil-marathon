'use client';

import type { QuizVariant } from '@/lib/types';
import { cn } from '@/lib/cn';
import { NumberBadge, QuizButton, QuizScreen, ScreenTitle } from './quiz-ui';

/**
 * Выбор квиза — макет 26:490.
 *
 * Две светлые плашки на синей подложке: слева название и подпись, справа
 * номер квиза. Номера цветные и разные (красный / синий) — так они читаются
 * как ярлыки вариантов, а не как порядковый список.
 */
export function QuizPickScreen({
  points,
  onPick,
  onStations,
}: {
  points: number;
  onPick: (variant: QuizVariant) => void;
  onStations: () => void;
}) {
  return (
    <QuizScreen points={points}>
      <ScreenTitle
        title="Выбери квиз"
        subtitle="Какой тебе по душе. Первый для тех, кто почти не был на марафонах. Второй для любителей и профи!"
      />

      <div className="space-y-5">
        <PickPlate
          title="Для новичков"
          note="8 рубрик"
          badge="1"
          badgeTone="red"
          onClick={() => onPick('v1')}
        />
        <PickPlate
          title="Гонка чемпионов"
          note="Докажи, что ты настоящий профи"
          badge="2"
          badgeTone="blue"
          onClick={() => onPick('v2')}
        />
      </div>

      {/* В макете на этом экране кнопки возврата нет, но без неё участник
          застревает в выборе квиза — оставляем тот же выход, что и везде. */}
      <div className="mt-auto flex justify-center pt-10">
        <QuizButton tone="pale" onClick={onStations}>
          К станциям
        </QuizButton>
      </div>
    </QuizScreen>
  );
}

function PickPlate({
  title,
  note,
  badge,
  badgeTone,
  onClick,
}: {
  title: string;
  note: string;
  badge: string;
  badgeTone: 'red' | 'blue';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-4 bg-teboil-blue-pale px-5 py-6',
        'text-left transition-colors active:bg-white',
      )}
    >
      <span className="min-w-0">
        <span className="block font-display text-kiosk-lg font-bold leading-tight text-teboil-black">
          {title}
        </span>
        <span className="mt-1 block text-kiosk-sm font-medium leading-tight text-teboil-black">
          {note}
        </span>
      </span>
      <NumberBadge value={badge} tone={badgeTone} />
    </button>
  );
}
