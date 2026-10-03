'use client';

import { useCallback, useEffect, useState } from 'react';
import { SkewedPlate, skewFor } from '@/components/ui';
import { truncateNickname } from '@/components/admin/format';
import { displayName } from '@/lib/validation';
import {
  RATINGS,
  RATING_IDS,
  formatRatingValue,
  ratingUnit,
  type PlayerRating,
  type RatingId,
  type RatingRow,
} from '@/lib/rating-defs';
import { AppHeader } from './AppHeader';
import { PromoCards } from './PromoCard';
import { getPlayerCard, getRatingTop } from './stations-api';

const BOARD_SIZE = 4;

/** Высоты плашек — от них считается глубина среза, чтобы угол остался 12°. */
const STATION_ROW_H = 54;
const BOARD_ROW_H = 46;

type Places = Record<RatingId, PlayerRating | null>;

const NO_PLACES: Places = { quiz: null, keepups: null, darts: null, obstacle: null };

/**
 * Экран станций (макет 51:108) — хаб участника после входа.
 *
 * По каждой из четырёх дисциплин показывает результат участника и его место
 * в рейтинге дня. Никаких полей ввода результата здесь нет и быть не должно:
 * результаты станций вносит волонтёр, участник их себе не ставит.
 */
export function StationsScreen({
  playerId,
  onBack,
}: {
  playerId: number;
  onBack: () => void;
}) {
  const [places, setPlaces] = useState<Places>(NO_PLACES);
  const [points, setPoints] = useState(0);
  const [board, setBoard] = useState<RatingRow[]>([]);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const [card, quizTop] = await Promise.all([
        getPlayerCard(playerId),
        getRatingTop('quiz', BOARD_SIZE),
      ]);
      setPlaces(card.ratings ?? NO_PLACES);
      setPoints(card.todayPoints);
      setBoard(quizTop.rows);
      setFailed(false);
    } catch {
      // Экран не гасим: прежние числа остаются, показываем тихую метку.
      setFailed(true);
    }
  }, [playerId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="screen pb-10">
      <AppHeader points={points} />

      <button
        type="button"
        onClick={onBack}
        className="min-h-tap px-4 font-display text-[14px] font-bold text-teboil-blue"
      >
        ← Назад
      </button>

      <section className="px-4 pb-5 pt-1 text-center">
        <p className="font-display text-[52px] font-black leading-none tabular-nums text-teboil-red">
          {points}
        </p>
        <p className="mt-1 text-[14px] font-medium text-teboil-muted">Баллов сегодня</p>
      </section>

      <section className="mx-4 bg-teboil-blue p-3">
        <ul className="space-y-2">
          {RATING_IDS.map((id) => (
            <StationRow key={id} id={id} place={places[id]} />
          ))}
        </ul>
      </section>

      <PromoCards className="mt-5 px-4" />

      <QuizBoard rows={board} />

      {failed && (
        <p className="mt-5 px-4 text-center text-[13px] font-medium text-teboil-muted">
          Нет связи с сервером стенда — показаны последние данные
        </p>
      )}
    </main>
  );
}

/**
 * Строка дисциплины: название, результат и место в рейтинге дня.
 * В спорте показан ЛУЧШИЙ результат — именно он стоит в рейтинге.
 */
function StationRow({ id, place }: { id: RatingId; place: PlayerRating | null }) {
  const def = RATINGS[id];

  return (
    <SkewedPlate
      as="li"
      tone="blue-60"
      skewX={skewFor(STATION_ROW_H)}
      className="h-[54px]"
      contentClassName="gap-3 px-5"
    >
      <span className="min-w-0 flex-1 font-display text-[15px] font-bold leading-tight text-teboil-white">
        {def.title}
      </span>

      <span className="shrink-0 text-[13px] font-medium tabular-nums text-teboil-white/80">
        {place
          ? `${formatRatingValue(id, place.value)} ${ratingUnit(id, place.value)}`
          : 'не пройдено'}
      </span>

      <span className="w-[56px] shrink-0 text-right font-display text-[22px] font-black leading-none tabular-nums text-teboil-white">
        {place ? `#${place.rank}` : '—'}
      </span>
    </SkewedPlate>
  );
}

/**
 * Верх рейтинга квиза внизу экрана. Первая строка красная, остальные синие —
 * так топ читается с одного взгляда, как в макете.
 */
function QuizBoard({ rows }: { rows: readonly RatingRow[] }) {
  if (rows.length === 0) return null;

  return (
    <section className="mt-8 px-4">
      <h2 className="mb-3 font-display text-[19px] font-bold text-teboil-red">
        Рейтинг квиза
      </h2>

      <ul className="space-y-2">
        {rows.map((row, index) => (
          <SkewedPlate
            as="li"
            key={row.id}
            tone={index === 0 ? 'red' : 'blue'}
            skewX={skewFor(BOARD_ROW_H)}
            className="h-[46px]"
            contentClassName="gap-3 px-5"
          >
            <span className="min-w-0 flex-1 truncate font-display text-[16px] font-bold text-teboil-white">
              {truncateNickname(displayName(row.nickname), 18)}
            </span>
            <span className="shrink-0 font-display text-[22px] font-black leading-none tabular-nums text-teboil-white">
              {row.value}
            </span>
          </SkewedPlate>
        ))}
      </ul>
    </section>
  );
}
