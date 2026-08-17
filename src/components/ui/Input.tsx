'use client';

import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string | null;
  hint?: string;
}

/**
 * Крупное поле ввода: белая скошенная плашка с синей обводкой — как на макете.
 * Обводку рисуем на обёртке (clip-path обрезал бы border), текст возвращаем
 * в вертикаль встречным скосом.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="mb-2 block font-display text-kiosk-sm font-bold text-teboil-blue"
        >
          {label}
        </label>
      )}
      <div
        className={cn(
          'flex min-h-tap-lg w-full items-center rounded-btn border-2 bg-white px-8 skew-x-brand',
          'transition-colors focus-within:border-teboil-red',
          error ? 'border-teboil-red' : 'border-teboil-blue',
        )}
      >
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          className={cn(
            'w-full bg-transparent text-kiosk-lg text-teboil-black outline-none skew-x-brand-inv',
            'placeholder:text-teboil-muted/70',
            className,
          )}
          {...rest}
        />
      </div>
      {error ? (
        <p className="mt-2 text-kiosk-sm font-bold text-teboil-red">{error}</p>
      ) : hint ? (
        <p className="mt-2 text-kiosk-sm text-teboil-muted">{hint}</p>
      ) : null}
    </div>
  );
});
