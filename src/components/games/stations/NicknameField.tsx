'use client';

import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { SkewedPlate } from '@/components/ui';
import { cn } from '@/lib/cn';

export interface NicknameFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  /** Текст ошибки под полем, например «Заполните это поле!». */
  error?: string | null;
  /** Нажатие на скошенную кнопку со стрелкой. */
  onSubmit?: () => void;
  className?: string;
}

/**
 * Поле ввода юзернейма со скошенной кнопкой-стрелкой (макет 5:21, состояние
 * с ошибкой — 11:139 и 31:588).
 *
 * Подпись в макете — «Придумайте никнейм», но заказчик подтвердил, что
 * никнейм остаётся телеграм-юзернеймом, поэтому текст здесь исправлен:
 * человек должен ввести существующий юзернейм, а не выдумать новый.
 *
 * Валидации здесь нет никакой: ни нормализации, ни проверки длины. Правила
 * живут в `src/lib/validation.ts` и в вызывающем экране — тянуть их
 * в оформление нельзя, иначе они разъедутся с серверными.
 */
export const NicknameField = forwardRef<HTMLInputElement, NicknameFieldProps>(
  function NicknameField({ error, onSubmit, className, id, ...rest }, ref) {
    const autoId = useId();
    const inputId = id ?? autoId;
    const errorId = `${inputId}-error`;

    return (
      <div className={cn('w-full', className)}>
        <label
          htmlFor={inputId}
          className="mb-2 block font-display text-[15px] font-bold text-teboil-blue"
        >
          Юзернейм в Телеграме
        </label>

        <div className="flex items-stretch gap-2">
          {/* Единственное место, где взят настоящий скос, а не clip-path:
              у поля есть обводка, а clip-path её срезает. Содержимое
              обязательно выпрямляется встречным скосом, иначе курсор и
              набираемый текст поедут вслед за рамкой. */}
          <div
            className={cn(
              'skew-x-brand skew-inset min-h-tap flex-1 border-2 bg-teboil-white',
              error ? 'border-teboil-red' : 'border-teboil-blue',
            )}
          >
            <input
              ref={ref}
              id={inputId}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className={cn(
                'skew-x-brand-inv h-full w-full bg-transparent px-4',
                'text-[17px] font-bold text-teboil-black outline-none',
                'placeholder:font-medium placeholder:text-teboil-muted',
              )}
              {...rest}
            />
          </div>

          <SkewedPlate
            as="button"
            tone="blue"
            onClick={onSubmit}
            aria-label="Продолжить"
            className="min-h-tap w-[76px] shrink-0"
            contentClassName="justify-center"
          >
            <span
              aria-hidden
              className="text-[24px] font-black leading-none text-teboil-white"
            >
              →
            </span>
          </SkewedPlate>
        </div>

        {error && (
          <p
            id={errorId}
            role="alert"
            className="mt-2 text-[15px] font-bold text-teboil-red"
          >
            {error}
          </p>
        )}
      </div>
    );
  },
);
