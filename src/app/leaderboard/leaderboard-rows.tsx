'use client';

import { truncateNickname } from '@/components/admin/format';
import { displayName } from '@/lib/validation';
import { SkewedPlate, skewFor } from '@/components/ui';
import { cn } from '@/lib/cn';

/** Строка для экрана: значение уже отформатировано («34», «23,4»). */
export interface LeaderboardEntry {
  rank: number;
  nickname: string;
  value: string;
}

/**
 * Строки на телевизоре высокие (около 6–8vh), поэтому срез задаётся от их
 * высоты, а не базовыми 12px — иначе край выглядел бы почти прямым.
 */
const ROW_SKEW = skewFor(7, 'vh');

/**
 * Оформление мест в светлой теме дизайн-бука: первое место — красная плашка,
 * остальные — синие. Пустые слоты серые, чтобы не спорить с топом.
 */
const FIRST = { tone: 'red', badge: 'text-teboil-red', text: 'text-teboil-white' } as const;
const REST = { tone: 'blue', badge: 'text-teboil-blue', text: 'text-teboil-white' } as const;
const EMPTY = { tone: 'gray', badge: 'text-teboil-muted', text: 'text-teboil-muted' } as const;

/**
 * Кегль ограничен и по высоте, и по ширине (`min(...)`): в узкой колонке ник
 * иначе упирался бы в число и обрезался у всех подряд. `compact` — для сетки
 * из четырёх рейтингов, где колонка вчетверо уже экрана.
 */
const FONTS = {
  wide: {
    badge: 'text-[min(3.4vh,1.7vw)]',
    text: 'text-[min(4.2vh,2.1vw)]',
    nick: 16,
  },
  compact: {
    badge: 'text-[min(2.4vh,1vw)]',
    text: 'text-[min(3vh,1.2vw)]',
    nick: 14,
  },
} as const;

/**
 * Таблица лидеров с фиксированной сеткой.
 *
 * Против дёрганья при автообновлении сделано три вещи:
 *  1. Всегда рисуется ровно `size` строк — даже если игроков меньше, пустые
 *     места занимают прочерки, и высота таблицы не меняется.
 *  2. Строки привязаны к номеру места, а не к игроку: React меняет только
 *     текст внутри готовых узлов, DOM не переставляется и ничего не мигает.
 *  3. Сетка задаёт равные доли высоты, колонки места и числа фиксированы,
 *     цифры моноширинные — смена «9» на «10» не сдвигает вёрстку.
 *
 * `columns` — на сколько колонок разложить места: двадцать мест в одну
 * колонку сделали бы строку вдвое ниже, а вместе с ней и шрифт.
 */
export function LeaderboardRows({
  rows,
  size,
  columns = 1,
  compact = false,
}: {
  rows: readonly LeaderboardEntry[];
  size: number;
  columns?: number;
  compact?: boolean;
}) {
  const byRank = new Map(rows.map((row) => [row.rank, row]));
  const slots = Array.from({ length: size }, (_, i) => i + 1);
  const font = compact ? FONTS.compact : FONTS.wide;

  return (
    <div
      className="grid h-full w-full grid-flow-col gap-x-[2vw] gap-y-[0.8vh]"
      style={{
        gridTemplateRows: `repeat(${Math.ceil(size / columns)}, minmax(0, 1fr))`,
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      }}
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
            contentClassName={compact ? 'gap-[0.7vw] px-[1vw]' : 'gap-[1.2vw] px-[1.6vw]'}
          >
            <span
              className={cn(
                'flex aspect-square h-[64%] shrink-0 items-center justify-center',
                'bg-teboil-white font-display font-black tabular-nums',
                font.badge,
                style.badge,
              )}
            >
              {rank}
            </span>

            <span
              className={cn(
                'min-w-0 flex-1 truncate font-display font-black leading-none',
                font.text,
                style.text,
              )}
            >
              {empty ? '—' : truncateNickname(displayName(entry.nickname), font.nick)}
            </span>

            <span
              className={cn(
                'shrink-0 text-right font-display font-black leading-none tabular-nums',
                font.text,
                style.text,
              )}
            >
              {empty ? '' : entry.value}
            </span>
          </SkewedPlate>
        );
      })}
    </div>
  );
}
