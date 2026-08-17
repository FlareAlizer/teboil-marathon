'use client';

import { cn } from '@/lib/cn';

export type TileTone = 'red' | 'blue';

/**
 * Крупная плитка главного экрана — «Квизы» (красная) и «Эстафета» (синяя).
 *
 * Справа две вертикальные полосы более светлых оттенков того же цвета: в
 * макете они уходят к правому краю и читаются как шкала. Это оформление,
 * поэтому от скринридера они спрятаны, а нажимается плитка целиком.
 *
 * Сама плитка прямоугольная — скос в макете здесь не применяется.
 */
const TONES: Record<TileTone, { base: string; mid: string; soft: string }> = {
  red: {
    base: 'bg-teboil-red',
    mid: 'bg-teboil-red-80',
    soft: 'bg-teboil-red-60',
  },
  blue: {
    base: 'bg-teboil-blue',
    mid: 'bg-teboil-blue-80',
    soft: 'bg-teboil-blue-60',
  },
};

export function BigTile({
  title,
  tone,
  onClick,
  className,
}: {
  title: string;
  tone: TileTone;
  onClick?: () => void;
  className?: string;
}) {
  const colors = TONES[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex h-[130px] w-full items-center overflow-hidden text-left',
        'transition-opacity active:opacity-90',
        colors.base,
        className,
      )}
    >
      <span aria-hidden className="absolute inset-y-0 right-0 flex w-[38%]">
        <span className={cn('h-full flex-1', colors.mid)} />
        <span className={cn('h-full flex-1', colors.soft)} />
      </span>

      <span className="relative z-10 pl-7 font-display text-[30px] font-black leading-none text-teboil-white">
        {title}
      </span>
    </button>
  );
}

/**
 * Разделитель между плитками и промо-карточками: короткая синяя плашка и
 * длинная тонкая красная линия. Чистое оформление.
 */
export function BrandDivider({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('flex items-center gap-2', className)}>
      <span className="h-[5px] w-[64px] shrink-0 bg-teboil-blue" />
      <span className="h-[2px] flex-1 bg-teboil-red" />
    </div>
  );
}
