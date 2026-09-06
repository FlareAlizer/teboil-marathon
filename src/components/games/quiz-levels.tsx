'use client';

import { cn } from '@/lib/cn';
import type { QuizVariant } from '@/lib/types';

/**
 * Цвет и подписи уровня сложности — один источник на все экраны квиза.
 *
 * Заказчик попросил помечать уровень цветом: до этого баллы за вопрос
 * выяснялись только после ответа. Цвет работает как метка, только если он
 * одинаков в интро, на выборе уровня и на самом вопросе, — поэтому таблица
 * лежит здесь, а не копируется по экранам.
 *
 * Наборы разные для синей подложки и для белой карточки: фирменный синий на
 * синем и светло-зелёный на белом одинаково нечитаемы, а квиз смотрят с
 * вытянутой руки.
 */

export interface LevelTone {
  /** Заливка квадрата-метки вместе с цветом цифры. */
  solid: string;
  /** Акцентный текст на СИНЕЙ подложке (баллы, заголовки). */
  text: string;
  /** Тот же акцент на БЕЛОЙ карточке — цвета из дизайн-бука. */
  textOnLight: string;
  /** Полоса прогресса на экране вопроса. */
  bar: string;
}

export const LEVEL_TONES: Record<1 | 2 | 3, LevelTone> = {
  1: {
    solid: 'bg-teboil-correct text-white',
    text: 'text-teboil-correct-60',
    textOnLight: 'text-teboil-correct',
    bar: 'bg-teboil-correct-60',
  },
  2: {
    // Средний уровень — светло-голубой: фирменный синий на синей подложке
    // не виден, а третий яркий цвет спорил бы с красным «сложным».
    solid: 'bg-teboil-blue-pale text-teboil-blue',
    text: 'text-teboil-blue-pale',
    textOnLight: 'text-teboil-blue-60',
    bar: 'bg-teboil-blue-pale',
  },
  3: {
    solid: 'bg-teboil-red text-white',
    text: 'text-teboil-red-60',
    textOnLight: 'text-teboil-red',
    bar: 'bg-teboil-red-60',
  },
};

/** Названия уровней первого квиза — по сложности вопросов. */
const DIFFICULTY_LABELS: Record<1 | 2 | 3, string> = {
  1: 'Лёгкий',
  2: 'Средний',
  3: 'Сложный',
};

/** Названия уровней второго квиза — из презентации (макет 37:137). */
const RACE_LABELS: Record<1 | 2 | 3, string> = {
  1: 'Новичок',
  2: 'Любитель',
  3: 'Профи',
};

const DIFFICULTY_NOTES: Record<1 | 2 | 3, string> = {
  1: 'Для разогрева',
  2: 'Надо подумать',
  3: 'Для знатоков',
};

const RACE_NOTES: Record<1 | 2 | 3, string> = {
  1: 'Разминка',
  2: 'Круизная скорость',
  3: 'Красная зона тахометра',
};

export function levelLabel(variant: QuizVariant, level: 1 | 2 | 3): string {
  return variant === 'v1' ? DIFFICULTY_LABELS[level] : RACE_LABELS[level];
}

export function levelNote(variant: QuizVariant, level: 1 | 2 | 3): string {
  return variant === 'v1' ? DIFFICULTY_NOTES[level] : RACE_NOTES[level];
}

/** Подписи «Легкие / Средние / Сложные» для карточек интро первого квиза. */
export const INTRO_DIFFICULTY_LABELS: Record<1 | 2 | 3, string> = {
  1: 'Легкие',
  2: 'Средние',
  3: 'Сложные',
};

/**
 * Метка уровня рядом с вопросом: цветной квадрат с номером, название и цена
 * верного ответа. Стоит на экране вопроса, чтобы участник видел ставку ДО
 * того, как ответит.
 */
export function LevelBadge({
  variant,
  level,
  points,
  penalty,
  className,
}: {
  variant: QuizVariant;
  level: 1 | 2 | 3;
  points: number;
  /** Сколько снимется за ошибку. Показываем рядом с наградой: цена решения
      должна быть видна до ответа, а не выясняться постфактум. */
  penalty?: number;
  className?: string;
}) {
  const tone = LEVEL_TONES[level];

  return (
    <span className={cn('flex items-center gap-3', className)}>
      <span
        aria-hidden
        className={cn(
          'flex h-[34px] w-[38px] shrink-0 items-center justify-center',
          'font-display text-kiosk-base font-bold',
          tone.solid,
        )}
      >
        {level}
      </span>
      <span className={cn('font-display text-kiosk-sm font-bold', tone.text)}>
        {levelLabel(variant, level)} · +{points}
        {penalty ? (
          <span className="text-teboil-red-60"> / −{penalty}</span>
        ) : null}
      </span>
    </span>
  );
}
