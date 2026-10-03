'use client';

import type { CurrentPlayer } from './game-api';
import { displayName } from '@/lib/validation';
import { QuizButton, QuizScreen } from './quiz-ui';
import { SCORING } from '@/lib/scoring';

/**
 * Витрина спортивных активностей.
 *
 * Это ТОЛЬКО оболочка: сами активности физические, у стенда, а баллы за них
 * начисляет оператор в админ-панели. Поэтому здесь намеренно нет никаких полей
 * ввода результата — участник не должен иметь возможности поставить себе баллы.
 * Задача экрана — объяснить правила и показать никнейм, который нужно назвать.
 */

interface Station {
  id: string;
  title: string;
  rule: string;
  scoring: string;
}

/**
 * У каждой станции свой рейтинг дня, и считается лучшая попытка — поэтому
 * в подписи под правилом сказано, по чему именно идёт рейтинг.
 */
const STATIONS: Station[] = [
  {
    id: 'keepups',
    title: 'Чеканка',
    rule: 'Набей мяч как можно больше раз, не уронив его.',
    scoring: 'Рейтинг — по числу касаний',
  },
  {
    id: 'darts',
    title: 'Дартс',
    rule: 'Серия бросков. Считается сумма выбитых очков.',
    scoring: 'Рейтинг — по сумме очков',
  },
  {
    id: 'obstacle',
    title: 'Полоса препятствий',
    rule: 'Проведи мяч змейкой между фишками и пробей по воротам. Волонтёр засекает время.',
    scoring: `Рейтинг — по времени. Промах: +${SCORING.sport.sport_obstacle.missPenaltySec} секунд`,
  },
];

export function SportsShowcase({
  player,
  onExit,
}: {
  player: CurrentPlayer;
  onExit: () => void;
}) {
  return (
    <QuizScreen points={player.todayPoints}>
      <div className="mb-7 bg-white p-5 text-center">
        <p className="mb-2 font-display text-kiosk-sm font-bold text-teboil-blue">
          Назови волонтёру свой никнейм
        </p>
        <p className="break-words font-display text-kiosk-xl font-black text-teboil-red">
          {displayName(player.nickname)}
        </p>
        <p className="mt-2 text-kiosk-sm font-medium leading-snug text-teboil-muted">
          Баллы за эти активности начисляет волонтёр после прохождения
        </p>
      </div>

      <ul className="space-y-3">
        {STATIONS.map((station, index) => (
          <li key={station.id} className="flex gap-5 bg-teboil-blue-80 px-4 py-5">
            <span
              aria-hidden
              className="flex h-[60px] w-[65px] shrink-0 items-center justify-center bg-teboil-blue-pale font-display text-kiosk-lg font-bold text-teboil-blue"
            >
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="font-display text-kiosk-lg font-bold leading-tight text-white">
                {station.title}
              </p>
              <p className="mt-1 text-kiosk-sm font-medium leading-snug text-white">
                {station.rule}
              </p>
              <p className="mt-1 text-kiosk-sm font-bold text-teboil-blue-pale">
                {station.scoring}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex justify-center pt-10">
        <QuizButton tone="pale" onClick={onExit}>
          К станциям
        </QuizButton>
      </div>
    </QuizScreen>
  );
}
