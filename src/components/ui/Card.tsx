import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type CardTone =
  | 'surface'
  | 'red'
  | 'blue'
  | 'pale'
  | 'outline'
  | 'outline-red'
  | 'outline-blue'
  | 'elevated';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: CardTone;
  title?: ReactNode;
  subtitle?: ReactNode;
  padded?: boolean;
}

const TONES: Record<CardTone, string> = {
  /** Серая плашка с макета — на белой и на синей подложке. */
  surface: 'bg-teboil-gray text-teboil-black',
  /** Светло-синяя плашка — для карточек на синей подложке. */
  pale: 'bg-teboil-blue-pale text-teboil-black',
  red: 'bg-teboil-red text-white',
  blue: 'bg-teboil-blue text-white',
  /** Белая карточка с толстой цветной рамкой — блок «Онлайн магазин». */
  'outline-red': 'bg-white text-teboil-black border-4 border-teboil-red',
  'outline-blue': 'bg-white text-teboil-black border-4 border-teboil-blue',
  outline: 'bg-white text-teboil-black border-2 border-teboil-line',
  elevated: 'bg-white text-teboil-black border border-teboil-line shadow-card',
};

/** Базовый блок-контейнер. Углы прямые — как во всём дизайн-буке. */
export function Card({
  tone = 'surface',
  title,
  subtitle,
  padded = true,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn('rounded-card', TONES[tone], padded && 'p-6 sm:p-8', className)}
      {...rest}
    >
      {title && (
        <h2 className="font-display text-kiosk-lg font-bold leading-tight">{title}</h2>
      )}
      {subtitle && <p className="mt-2 text-kiosk-sm">{subtitle}</p>}
      {(title || subtitle) && children ? <div className="mt-6">{children}</div> : children}
    </div>
  );
}
