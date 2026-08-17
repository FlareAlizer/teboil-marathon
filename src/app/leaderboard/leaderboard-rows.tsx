'use client';

import type { LeaderboardRow } from '@/lib/types';
import { truncateNickname } from '@/components/admin/format';
import { displayName } from '@/lib/validation';
import { SkewedPlate, skewFor } from '@/components/ui';
import { cn } from '@/lib/cn';

export const LEADERBOARD_SIZE = 10;

export type LeaderboardEntry = Pick<LeaderboardRow, 'rank' | 'nickname' | 'points'>;

/**
 * Строки на телевизоре высокие (около 8vh), поэтому срез задаётся от их
 * высоты, а не базовыми 12px — иначе край выглядел бы почти прямым.
 */
const ROW_SKEW = skewFor(8, 'vh');

/**
 * Оформление мест в светлой теме дизайн-бука: первое место — красная плашка,
 * остальные — синие. Пустые слоты серые, чтобы не спорить с топом.
 */
const FIRST = {
  tone: 'red',
  badge: 'text-teboil-red',
  text: 'text-teboil-white',
} as const;
const REST = {
  tone: 'blue',
  badge: 'text-teboil-blue',
  text: 'text-teboil-white',
} as const;
const EMPTY = {
  tone: 'gray',
  badge: 'text-teboil-muted',
  text: 'text-teboil-muted',
} as const;

/**
 * Таблица лидеров с фиксированной сеткой.
 *
 * Против дёрганья при автообновлении сделано три вещи:
 *  1. Всегда рисуются ровно LEADERBOARD_SIZE строк — даже если игроков меньше,
 *     пустые места занимают прочерки, и высота таблицы не меняется.
 *  2. Строки привязаны к номеру места, а не к игроку: React меняет только
 *     текст внутри готовых узлов, DOM не переставляется и ничего не мигает.
 *  3. Сетка задаёт равные доли высоты, колонки места и баллов фиксированы,
 *     цифры моноширинные — смена «9» на «10» не сдвигает вёрстку.
 */
export function LeaderboardRows({ rows }: { rows: readonly LeaderboardEntry[] }) {
  const byRank = new Map(rows.map((row) => [row.rank, row]));
  const slots = Array.from({ length: LEADERBOARD_SIZE }, (_, i) => i + 1);

  return (
    <div
      className="grid h-full w-full gap-[1vh]"
      style={{ gridTemplateRows: `repeat(${LEADERBOARD_SIZE}, minmax(0, 1fr))` }}
    >
      {slots.map((rank) => {
        const entry = byRank.get(rank);
        const empty = entry === undefined;
        const style = empty ? EMPTY : rank === 1 ? FIRST : REST;

        return (
          <SkewedPlate
            key={rank}
            tone={style.tone}
            skewX={ROW_SKEW}
            className="min-h-0"
            contentClassName="gap-[2vw] px-[3vw]"
          >
            <span
              className={cn(
                'flex aspect-square h-[64%] shrink-0 items-center justify-center',
                'bg-teboil-white font-display text-[4.2vh] font-black tabular-nums',
                style.badge,
              )}
            >
              {rank}
            </span>

            <span
              className={cn(
                'min-w-0 flex-1 truncate font-display text-[5.4vh] font-black leading-none',
                style.text,
              )}
            >
              {empty ? '—' : truncateNickname(displayName(entry.nickname), 20)}
            </span>

            <span
              className={cn(
                'w-[22%] shrink-0 text-right font-display text-[5.4vh] font-black leading-none tabular-nums',
                style.text,
              )}
            >
              {empty ? '0' : entry.points}
            </span>
          </SkewedPlate>
        );
      })}
    </div>
  );
}
