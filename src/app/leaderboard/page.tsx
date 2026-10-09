'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getRatings, getStats } from '@/components/admin/endpoints';
import {
  RATINGS,
  formatRatingValue,
  isRatingId,
  type RatingBoard,
  type RatingId,
} from '@/lib/rating-defs';
import { SkewedPlate, skewFor } from '@/components/ui';
import { LeaderboardRows, type LeaderboardEntry } from './leaderboard-rows';
import { LeaderboardFooter, LeaderboardHeader } from './leaderboard-chrome';
import { usePolled } from './use-polled';

/** Мест на рейтинг в общей сетке из четырёх. */
const GRID_SIZE = 10;
/** Мест, когда на экране один рейтинг (экран у станции). */
const SINGLE_SIZE = 20;

const TITLE_SKEW = skewFor(5, 'vh');

interface BoardData {
  boards: RatingBoard[];
  visitors: number;
}

function entries(board: RatingBoard): LeaderboardEntry[] {
  return board.rows.map((row) => ({
    rank: row.rank,
    nickname: row.nickname,
    value: formatRatingValue(board.id, row.value),
  }));
}

/**
 * Экран для телевизора на стенде.
 *
 * По умолчанию — четыре рейтинга рядом: квиз, чеканка, дартс, полоса.
 * С адресом `/leaderboard?board=darts` — один рейтинг крупно на двадцать
 * мест: такой экран можно повесить прямо у станции.
 *
 * Висит без присмотра: никаких кнопок, ничего не нажимается, при обрыве связи
 * на экране остаются последние данные. Обновление раз в 10 секунд затрагивает
 * только текст внутри готовых строк — вёрстка не пересобирается.
 */
export default function LeaderboardPage() {
  // Адрес читаем после монтирования: useSearchParams потребовал бы обернуть
  // статическую страницу в Suspense ради одного параметра.
  const [only, setOnly] = useState<RatingId | null | undefined>(undefined);

  useEffect(() => {
    const board = new URLSearchParams(window.location.search).get('board');
    setOnly(isRatingId(board) ? board : null);
  }, []);

  // Пока не прочитан адрес, не знаем, что рисовать, — и не дёргаем сервер зря.
  if (only === undefined) return <main className="screen h-dvh" />;

  return <Screen only={only} />;
}

/** Сам экран. Монтируется, когда уже известно, один рейтинг нужен или все. */
function Screen({ only }: { only: RatingId | null }) {
  // Последнее известное число участников: если запрос счётчика не прошёл,
  // показываем его, а рейтинги всё равно обновляем.
  const visitors = useRef(0);

  const load = useCallback(async (): Promise<BoardData> => {
    const [ratings, stats] = await Promise.allSettled([
      getRatings(only ? SINGLE_SIZE : GRID_SIZE, only ?? undefined),
      getStats(),
    ]);
    if (ratings.status === 'rejected') throw ratings.reason;
    if (stats.status === 'fulfilled') visitors.current = stats.value.totalVisitors;
    return { boards: ratings.value.boards, visitors: visitors.current };
  }, [only]);

  const { data, stale } = usePolled(load, 10_000);

  return (
    <main className="screen flex h-dvh cursor-none flex-col overflow-hidden no-select">
      <LeaderboardHeader title={only ? RATINGS[only].title : 'Топ дня'} />

      <div className="min-h-0 flex-1 px-[3vw]">
        {only ? (
          <LeaderboardRows
            rows={data?.boards[0] ? entries(data.boards[0]) : []}
            size={SINGLE_SIZE}
            columns={2}
          />
        ) : (
          <div className="grid h-full grid-cols-4 gap-[1.6vw]">
            {(data?.boards ?? []).map((board) => (
              <section key={board.id} className="flex min-h-0 flex-col">
                <SkewedPlate
                  as="h2"
                  tone="blue"
                  skewX={TITLE_SKEW}
                  className="mb-[1vh] shrink-0"
                  contentClassName="justify-between gap-[0.6vw] px-[1vw] py-[0.8vh]"
                >
                  <span className="truncate font-display text-[min(3vh,1.3vw)] font-black leading-none text-teboil-white">
                    {board.title}
                  </span>
                  <span className="shrink-0 font-display text-[min(2vh,0.9vw)] font-bold leading-none text-teboil-blue-40">
                    {board.unit}
                  </span>
                </SkewedPlate>
                <div className="min-h-0 flex-1">
                  <LeaderboardRows rows={entries(board)} size={GRID_SIZE} compact />
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <LeaderboardFooter visitors={data?.visitors ?? null} stale={stale} />
    </main>
  );
}
