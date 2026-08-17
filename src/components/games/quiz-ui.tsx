'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { AppHeader } from './stations/AppHeader';

/**
 * Общие блоки экранов квиза по дизайн-буку (Figma h8djIhDnfkgyOw7Pl3O8Ew).
 *
 * Шапка на всех экранах одна и та же (`AppHeader` из stations/), подложка —
 * фирменная синяя, плашки скошены под 12°. Здесь только оформление: ни один
 * из этих блоков не знает про баллы, ответы и правила — их приносят пропсами.
 */

/* ------------------------------- Каркас экрана ----------------------------- */

export function QuizScreen({
  points,
  children,
  footer,
}: {
  points: number;
  children: ReactNode;
  /**
   * Нижний блок на БЕЛОМ фоне. На экране вопроса (38:201) кнопки стоят под
   * синей областью, на остальных экранах кнопки лежат внутри синей — тогда
   * футер не передаётся.
   */
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <AppHeader points={points} />

      <div className="flex flex-1 flex-col bg-teboil-blue px-5 pb-8 pt-9 text-white">
        {children}
      </div>

      {footer && (
        <div className="flex flex-col items-center gap-4 bg-white px-5 py-7">
          {footer}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- Кнопки --------------------------------- */

export type QuizButtonTone = 'red' | 'pale' | 'red-soft' | 'blue-soft';

const BUTTON_TONES: Record<QuizButtonTone, string> = {
  /** «Начать квиз», «Крутить колесо» — главное действие. */
  red: 'bg-teboil-red text-white active:bg-teboil-red-dark',
  /**
   * «К станциям», «Выбрать тему» — вторичное действие на синей подложке.
   *
   * В макете текст на этой плашке светло-серый (`#D1D3D4`), но на белом это
   * контраст 1.5:1 при норме WCAG AA 3:1 для крупного жирного текста: на
   * киоске, который читают с вытянутой руки, кнопка выглядит пустой. Берём
   * фирменный синий (~9:1) — он же стоит на кнопке «Лидерборд» в меню.
   */
  pale: 'bg-white text-teboil-blue active:bg-teboil-blue-pale',
  /**
   * «Далее» и «К станциям» на белом футере экрана вопроса.
   *
   * Заливка фирменная, а не 60-процентный тинт: на тинте кнопка выглядит
   * выцветшей и не читается как активная, да и белый текст на `#FF727F`
   * даёт всего ~2.6:1 при норме WCAG AA 3:1 для крупного жирного текста.
   * Нажатое состояние наоборот уводим в светлый тон — так виден отклик.
   */
  'red-soft': 'bg-teboil-red text-white active:bg-teboil-red-60',
  'blue-soft': 'bg-teboil-blue text-white active:bg-teboil-blue-60',
};

/**
 * Скошенная кнопка макета: ширина как в дизайне, но не шире экрана — киоск
 * переносят и на узкие планшеты.
 *
 * Намеренно НЕ обёртка над `ui/Button`: у того тон задаётся пропом `variant`,
 * и перекрыть его фон через className нельзя — `cn` просто склеивает строки,
 * а какая из двух конфликтующих утилит Tailwind победит, решает порядок в
 * собранном CSS, а не порядок в атрибуте. Поэтому фон задаётся здесь один раз.
 * Скос берётся теми же токенами дизайн-системы (skew-x-brand).
 */
export function QuizButton({
  tone = 'red',
  children,
  onClick,
  disabled,
  className,
}: {
  tone?: QuizButtonTone;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex min-h-tap w-full max-w-[280px] items-center justify-center px-8',
        'skew-x-brand font-display text-kiosk-base font-bold',
        'transition-colors duration-150 active:scale-[.98]',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100',
        BUTTON_TONES[tone],
        className,
      )}
    >
      <span className="skew-x-brand-inv">{children}</span>
    </button>
  );
}

/* --------------------------------- Плашки ---------------------------------- */

export type BadgeTone = 'pale' | 'pale-blue' | 'red' | 'blue';

const BADGE_TONES: Record<BadgeTone, string> = {
  pale: 'bg-teboil-blue-pale text-teboil-red',
  /** Тот же светлый квадрат, но с синей цифрой — номера в списке чередуются. */
  'pale-blue': 'bg-teboil-blue-pale text-teboil-blue',
  red: 'bg-teboil-red text-white',
  blue: 'bg-teboil-blue text-white',
};

/** Квадрат с номером слева от заголовка — уровни, темы, номера квизов. */
export function NumberBadge({
  value,
  tone = 'pale',
}: {
  value: ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-[60px] w-[65px] shrink-0 items-center justify-center',
        'font-display text-kiosk-lg font-bold',
        BADGE_TONES[tone],
      )}
    >
      {value}
    </span>
  );
}

/**
 * Строка-плашка: номер, заголовок, подпись и необязательное значение справа.
 * Из неё собраны список уровней (37:137) и список тем (49:332).
 *
 * Если передан `onClick`, плашка становится кнопкой — тач-цель во всю строку,
 * 100px по макету, что заметно больше минимальных 56px.
 */
export function RowPlate({
  badge,
  badgeTone = 'pale',
  title,
  note,
  trailing,
  onClick,
  disabled,
}: {
  badge: ReactNode;
  badgeTone?: BadgeTone;
  title: string;
  note?: string;
  trailing?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const body = (
    <>
      <NumberBadge value={badge} tone={badgeTone} />
      <span className="min-w-0 flex-1 text-left">
        <span className="block font-display text-kiosk-lg font-bold leading-tight text-white">
          {title}
        </span>
        {note && (
          <span className="mt-1 block text-kiosk-sm font-medium leading-tight text-white">
            {note}
          </span>
        )}
      </span>
      {trailing}
    </>
  );

  const shell = 'flex w-full items-center gap-5 bg-teboil-blue-80 px-4 py-5';

  if (!onClick) {
    return <div className={shell}>{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        shell,
        'transition-colors active:bg-teboil-blue-60',
        'disabled:opacity-50 disabled:active:bg-teboil-blue-80',
      )}
    >
      {body}
    </button>
  );
}

/* -------------------------------- Заголовки -------------------------------- */

/** Заголовок экрана + необязательный подзаголовок, как в макете. */
export function ScreenTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-7">
      <h1 className="font-display text-[2rem] font-black leading-tight text-white">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-4 text-kiosk-base font-medium leading-snug text-white">
          {subtitle}
        </p>
      )}
    </div>
  );
}

/**
 * Сообщение об ошибке. Экран квиза не должен молча ломаться: если сервер не
 * ответил, участник обязан это увидеть, иначе он будет тыкать в мёртвую кнопку.
 */
export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="mb-5 bg-teboil-red px-4 py-3 text-kiosk-sm font-bold text-white"
    >
      {children}
    </p>
  );
}
