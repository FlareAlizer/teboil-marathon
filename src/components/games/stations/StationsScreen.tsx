'use client';

import { useCallback, useEffect, useState } from 'react';
import { SkewedPlate, skewFor } from '@/components/ui';
import { truncateNickname } from '@/components/admin/format';
import { displayName } from '@/lib/validation';
import type { LeaderboardRow } from '@/lib/types';
import { AppHeader } from './AppHeader';
import { PromoCards } from './PromoCard';
import { getDayLeaderboard, getPlayerCard } from './stations-api';
import { stationsFromEvents, type StationProgress } from './stations-progress';

const BOARD_SIZE = 4;

/** Высоты плашек — от них считается глубина среза, чтобы угол остался 12°. */
const STATION_ROW_H = 54;
const BOARD_ROW_H = 46;

/**
 * Экран станций (макет 51:108) — хаб участника после входа.
 *
 * Показывает, сколько человек уже прошёл по каждой активности и сколько за
 * это набрал. Никаких полей ввода результата здесь нет и быть не должно:
 * баллы за спортивные станции заводит оператор через админку, участник их
 * себе не ставит.
 */
export function StationsScreen({
  playerId,
  onBack,
}: {
  playerId: number;
  onBack: () => void;
}) {
  const [stations, setStations] = useState<StationProgress[]>(
    stationsFromEvents([]),
  );
  const [points, setPoints] = useState(0);
  const [board, setBoard] = useState<LeaderboardRow[]>([]);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const [card, leaderboard] = await Promise.all([
        getPlayerCard(playerId),
        getDayLeaderboard(BOARD_SIZE),
      ]);
      setStations(stationsFromEvents(card.events));
      setPoints(card.todayPoints);
      setBoard(leaderboard.rows);
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
        <p className="mt-1 text-[14px] font-medium text-teboil-muted">
          Очков в лидерборд
        </p>
      </section>

      <section className="mx-4 bg-teboil-blue p-3">
        <ul className="space-y-2">
          {stations.map((station) => (
            <StationRow key={station.id} station={station} />
          ))}
        </ul>
      </section>

      <PromoCards className="mt-5 px-4" />

      <DayBoard rows={board} />

      {failed && (
        <p className="mt-5 px-4 text-center text-[13px] font-medium text-teboil-muted">
          Нет связи с сервером стенда — показаны последние данные
        </p>
      )}
    </main>
  );
}

/**
 * Строка станции: название, прогресс и набранные очки.
 *
 * Прогресс показывается по-разному, и это намеренно. У квиза есть настоящий
 * знаменатель — три уровня, поэтому «1 из 3». У спортивных станций числа
 * попыток не существует, поэтому там честное «пройдено» вместо выдуманного
 * «0 из 1».
 */
function StationRow({ station }: { station: StationProgress }) {
  const progress =
    station.total !== null
      ? `${station.done} из ${station.total}`
      : station.done > 0
        ? 'пройдено'
        : 'не пройдено';

  return (
    <SkewedPlate
      as="li"
      tone="blue-60"
      skewX={skewFor(STATION_ROW_H)}
      className="min-h-[54px]"
      contentClassName="gap-3 px-5"
    >
      <span className="min-w-0 flex-1 font-display text-[15px] font-bold leading-tight text-teboil-white">
        {station.title}
      </span>

      <span className="shrink-0 text-[13px] font-medium tabular-nums text-teboil-white/80">
        {progress}
      </span>

      <span className="w-[46px] shrink-0 text-right font-display text-[24px] font-black leading-none tabular-nums text-teboil-white">
        {station.points}
      </span>
    </SkewedPlate>
  );
}

/**
 * «Лидерборд дня» внизу экрана. Первая строка красная, остальные синие —
 * так топ читается с одного взгляда, как в макете.
 */
function DayBoard({ rows }: { rows: readonly LeaderboardRow[] }) {
  if (rows.length === 0) return null;

  return (
    <section className="mt-8 px-4">
      <h2 className="mb-3 font-display text-[19px] font-bold text-teboil-red">
        Лидерборд дня
      </h2>

      <ul className="space-y-2">
        {rows.map((row, index) => (
          <SkewedPlate
            as="li"
            key={row.id}
            tone={index === 0 ? 'red' : 'blue'}
            skewX={skewFor(BOARD_ROW_H)}
            className="min-h-[46px]"
            contentClassName="gap-3 px-5"
          >
            <span className="min-w-0 flex-1 truncate font-display text-[16px] font-bold text-teboil-white">
              {truncateNickname(displayName(row.nickname), 18)}
            </span>
            <span className="shrink-0 font-display text-[22px] font-black leading-none tabular-nums text-teboil-white">
              {row.points}
            </span>
          </SkewedPlate>
        ))}
      </ul>
    </section>
  );
}
