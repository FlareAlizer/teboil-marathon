'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'dark' | 'danger';
export type ButtonSize = 'md' | 'lg' | 'xl';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  /** Отключить фирменный срез 12° — например, для иконки в круге. */
  square?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-teboil-red text-white border-2 border-teboil-red hover:bg-teboil-red-80 active:bg-teboil-red-dark',
  secondary:
    'bg-teboil-blue text-white border-2 border-teboil-blue hover:bg-teboil-blue-80 active:bg-teboil-blue',
  ghost:
    'bg-white text-teboil-blue border-2 border-teboil-blue hover:bg-teboil-blue-pale active:bg-teboil-blue-pale',
  dark: 'bg-teboil-black text-white border-2 border-teboil-black hover:bg-teboil-muted',
  danger:
    'bg-white text-teboil-red border-2 border-teboil-red hover:bg-teboil-red hover:text-white',
};

/** Отступы с запасом: скошенные края съедают края плашки. */
const SIZES: Record<ButtonSize, string> = {
  md: 'min-h-tap px-8 text-kiosk-base',
  lg: 'min-h-tap-lg px-10 text-kiosk-lg',
  xl: 'min-h-tap-xl px-12 text-kiosk-xl',
};

/**
 * Крупная тач-кнопка киоска: минимальная высота 56px, срез 12° по макету.
 * Скос делается tailwind-утилитами skew-x-brand / skew-x-brand-inv — они
 * складываются с active:scale, в отличие от прямого transform в CSS.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'lg',
    fullWidth = false,
    loading = false,
    square = false,
    disabled,
    className,
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-btn font-display font-bold',
        'transition-colors duration-150 active:scale-[.98]',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100',
        !square && 'skew-x-brand',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      <span
        className={cn(
          'inline-flex items-center justify-center gap-3',
          !square && 'skew-x-brand-inv',
        )}
      >
        {loading && (
          <span
            aria-hidden
            className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        )}
        {children}
      </span>
    </button>
  );
});
