import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Фирменная скошенная плашка — главный приём дизайн-бука.
 *
 * Угол один на весь проект и живёт в `--skew-angle` / `--skew-x` (globals.css).
 * Он измерен по векторным путям макета, а не на глаз: у кнопки со стрелкой
 * (узел 11:135) путь `M9.46631 0 H117.5 L108 44.5 H0 Z` даёт
 * atan(9.46631 / 44.5) = 12.01°, у поля ввода (10:133) — 11.86°. Это 12°.
 *
 * Реализовано через clip-path, а не через skewX, специально: содержимое
 * остаётся вертикальным без встречного скоса, плашка не выступает за свой
 * бокс и не ломает раскладку. Обратная сторона — clip-path срезает border,
 * поэтому рамка рисуется вторым слоем (проп `border`).
 */

/** Тангенс фирменных 12° — единственное место, где это число записано. */
const TAN_SKEW = 0.2126;

/**
 * Глубина среза для плашки заданной высоты — чтобы угол остался 12°.
 *
 * `--skew-x` по умолчанию 12px, что даёт 12° при высоте 56px. У высокого блока
 * те же 12px читаются как почти прямой край, поэтому срез считается от его
 * собственной высоты. Считать это в уме не надо: 2vh на блоке высотой 7.4vh —
 * это уже 15°, а не 12°, и на глаз такое расхождение не ловится.
 *
 * Единица любая, лишь бы высота была в ней же: на телевизоре вёрстка в `vh`,
 * и пропорция сохраняется только когда обе величины в `vh`.
 *
 * @example <SkewedPlate skewX={skewFor(157)} className="h-[157px]" />
 * @example <SkewedPlate skewX={skewFor(8, 'vh')} className="h-[8vh]" />
 */
export function skewFor(height: number, unit: string = 'px'): string {
  const raw = height * TAN_SKEW;
  // В пикселях дробь бессмысленна, в относительных единицах — наоборот важна.
  return unit === 'px' ? `${Math.round(raw)}px` : `${Math.round(raw * 100) / 100}${unit}`;
}

export type PlateTone =
  | 'red'
  | 'red-80'
  | 'red-60'
  | 'blue'
  | 'blue-80'
  | 'blue-60'
  | 'blue-pale'
  | 'gray'
  | 'white'
  | 'black'
  | 'correct'
  | 'wrong'
  | 'none';

/** Какие вертикальные грани срезаны. */
export type PlateCut = 'both' | 'right' | 'left' | 'none';

const TONES: Record<PlateTone, string> = {
  red: 'bg-teboil-red text-white',
  'red-80': 'bg-teboil-red-80 text-white',
  'red-60': 'bg-teboil-red-60 text-white',
  blue: 'bg-teboil-blue text-white',
  'blue-80': 'bg-teboil-blue-80 text-white',
  'blue-60': 'bg-teboil-blue-60 text-white',
  'blue-pale': 'bg-teboil-blue-pale text-teboil-black',
  gray: 'bg-teboil-gray text-teboil-black',
  white: 'bg-white text-teboil-black',
  black: 'bg-teboil-black text-white',
  correct: 'bg-teboil-correct text-white',
  wrong: 'bg-teboil-wrong text-white',
  none: '',
};

const BORDERS: Record<Exclude<PlateTone, 'none'>, string> = {
  red: 'bg-teboil-red',
  'red-80': 'bg-teboil-red-80',
  'red-60': 'bg-teboil-red-60',
  blue: 'bg-teboil-blue',
  'blue-80': 'bg-teboil-blue-80',
  'blue-60': 'bg-teboil-blue-60',
  'blue-pale': 'bg-teboil-blue-pale',
  gray: 'bg-teboil-gray',
  white: 'bg-white',
  black: 'bg-teboil-black',
  correct: 'bg-teboil-correct',
  wrong: 'bg-teboil-wrong',
};

const CUTS: Record<PlateCut, string> = {
  both: 'clip-skewed',
  right: 'clip-skewed-right',
  left: 'clip-skewed-left',
  none: '',
};

export interface SkewedPlateProps extends Omit<HTMLAttributes<HTMLElement>, 'color'> {
  /** Какой тег рендерить. `button` включает поведение кнопки. */
  as?: ElementType;
  /** Заливка из фирменной палитры. */
  tone?: PlateTone;
  /** Какие грани срезаны. По умолчанию обе (параллелограмм). */
  cut?: PlateCut;
  /** Глубина среза. По умолчанию 12px — под высоту ~56px. */
  skewX?: string;
  /** Цвет рамки. Рисуется подложкой, потому что clip-path съедает border. */
  border?: Exclude<PlateTone, 'none'>;
  /** Толщина рамки, по умолчанию 2px. */
  borderWidth?: number;
  /** Классы на внутренний слой с содержимым — дополняют раскладку. */
  contentClassName?: string;
  /**
   * Заменяет раскладку внутреннего слоя целиком.
   *
   * По умолчанию там `flex h-full w-full items-center`. Дописать `justify-*`
   * или `gap-*` можно через `contentClassName`, а вот сменить `flex` на `grid`
   * или `block` — нет: порядок в строке классов ничего не решает, побеждает
   * порядок правил в CSS. Для этого и нужен отдельный проп.
   *
   * @example contentLayout="grid h-full w-full grid-cols-2"
   */
  contentLayout?: string;
  children?: ReactNode;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}

/**
 * @example Кнопка со срезом справа
 * <SkewedPlate as="button" tone="red" cut="right" onClick={go}
 *   className="min-h-tap px-8" contentClassName="font-bold">Начать квиз</SkewedPlate>
 *
 * @example Высокая плашка — срез масштабируется вместе с высотой
 * <SkewedPlate tone="blue" skewX="33px" className="h-[157px]" />
 */
export function SkewedPlate({
  as,
  tone = 'red',
  cut = 'both',
  skewX,
  border,
  borderWidth = 2,
  className,
  contentClassName,
  contentLayout,
  children,
  disabled,
  type,
  ...rest
}: SkewedPlateProps) {
  const Tag = (as ?? 'div') as ElementType;
  const isButton = Tag === 'button';
  const style = skewX ? ({ '--skew-x': skewX } as React.CSSProperties) : undefined;

  const content = (
    <div
      className={cn(contentLayout ?? 'flex h-full w-full items-center', contentClassName)}
    >
      {children}
    </div>
  );

  return (
    <Tag
      className={cn(
        'relative',
        CUTS[cut],
        border ? BORDERS[border] : TONES[tone],
        isButton && 'transition-opacity active:opacity-80 disabled:opacity-40',
        className,
      )}
      style={style}
      disabled={isButton ? disabled : undefined}
      type={isButton ? (type ?? 'button') : undefined}
      {...rest}
    >
      {border ? (
        // Внутренний слой с той же геометрией, вжатый на толщину рамки.
        // Блочный элемент с margin сам занимает ширину родителя минус поля,
        // поэтому считать calc() не нужно — и высота остаётся по содержимому.
        <div
          className={cn(CUTS[cut], TONES[tone])}
          style={{ margin: borderWidth }}
        >
          {content}
        </div>
      ) : (
        content
      )}
    </Tag>
  );
}
