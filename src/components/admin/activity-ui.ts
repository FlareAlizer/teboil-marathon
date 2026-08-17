/**
 * Описание ввода результата для каждой спортивной активности.
 *
 * Ключевая мысль: оператор стоит у стенда с телефоном в одной руке, рядом
 * очередь. Поэтому под каждую активность заранее задан правильный тип
 * клавиатуры, единица измерения и быстрые кнопки-инкременты — чтобы результат
 * вводился за одно-два касания, а не набором на мелкой клавиатуре.
 *
 * Файл намеренно без внешних зависимостей, кроме типов предметной области.
 */

import type { SportActivity } from '@/lib/types';

/** Как вводится сырой результат. */
export type SportInputKind =
  /** Целое число: касания, очки. */
  | 'integer'
  /** Секунды, допускается одна цифра после запятой. */
  | 'seconds'
  /** Две кнопки: попал / не попал. */
  | 'binary';

export interface SportActivityUi {
  key: SportActivity;
  /** Короткая подпись на крупной кнопке выбора активности. */
  short: string;
  /** Что именно вводим — подсказка над полем. */
  prompt: string;
  kind: SportInputKind;
  /** Единица измерения рядом с полем: «касаний», «сек», «очков». */
  unit: string;
  placeholder: string;
  min: number;
  max: number;
  /** Быстрые кнопки прибавки — экономят касания на цифровой клавиатуре. */
  steps: number[];
  /** Подписи для kind === 'binary'. */
  positiveLabel?: string;
  negativeLabel?: string;
}

export const SPORT_UI: Record<SportActivity, SportActivityUi> = {
  sport_keepups: {
    key: 'sport_keepups',
    short: 'Бутсы — чеканка',
    prompt: 'Сколько касаний',
    kind: 'integer',
    unit: 'касаний',
    placeholder: '0',
    min: 0,
    max: 999,
    steps: [1, 5, 10],
  },
  sport_obstacle: {
    key: 'sport_obstacle',
    short: 'Полоса препятствий',
    prompt: 'Время прохождения',
    kind: 'seconds',
    unit: 'сек',
    placeholder: '0,0',
    min: 0,
    max: 999,
    steps: [1, 5, 10],
  },
  sport_goal: {
    key: 'sport_goal',
    short: 'Забей гол',
    prompt: 'Результат удара',
    kind: 'binary',
    unit: '',
    placeholder: '',
    min: 0,
    max: 1,
    steps: [],
    positiveLabel: 'Попал',
    negativeLabel: 'Не попал',
  },
  sport_darts: {
    key: 'sport_darts',
    short: 'Дартс',
    prompt: 'Набранные очки',
    kind: 'integer',
    unit: 'очков',
    placeholder: '0',
    min: 0,
    max: 999,
    steps: [1, 5, 10],
  },
};

/** Порядок крупных кнопок на главном экране админки. */
export const SPORT_ORDER: SportActivity[] = [
  'sport_keepups',
  'sport_obstacle',
  'sport_goal',
  'sport_darts',
];

/**
 * Атрибуты поля ввода: от них зависит, какая клавиатура откроется на телефоне.
 * Числовая без точки для касаний и очков, с разделителем — для секунд.
 */
export function inputAttrsFor(kind: SportInputKind): {
  inputMode: 'numeric' | 'decimal';
  pattern: string;
} {
  return kind === 'seconds'
    ? { inputMode: 'decimal', pattern: '[0-9.,]*' }
    : { inputMode: 'numeric', pattern: '[0-9]*' };
}

/** Каноничная строка попадания/промаха, уходит в rawResult. */
export const GOAL_HIT = 'hit';
export const GOAL_MISS = 'miss';

export interface ParsedResult {
  /** Числовое значение для подсчёта баллов. Для гола: 1 — попал, 0 — мимо. */
  value: number;
  /** Строка, которую сохраняем в rawResult. */
  canonical: string;
}

/**
 * Разбирает то, что оператор набрал в поле. Возвращает null, если ввод пустой
 * или некорректный — кнопка «Начислить» в этом случае остаётся заблокированной.
 */
export function parseSportResult(
  activity: SportActivity,
  input: string,
): ParsedResult | null {
  const ui = SPORT_UI[activity];

  if (ui.kind === 'binary') {
    if (input === GOAL_HIT) return { value: 1, canonical: GOAL_HIT };
    if (input === GOAL_MISS) return { value: 0, canonical: GOAL_MISS };
    return null;
  }

  const cleaned = input.trim().replace(',', '.');
  if (cleaned === '') return null;

  const num = Number(cleaned);
  if (!Number.isFinite(num) || num < ui.min || num > ui.max) return null;

  if (ui.kind === 'integer') {
    if (!Number.isInteger(num)) return null;
    return { value: num, canonical: String(num) };
  }

  // Секунды: округляем до десятых, чтобы в базе не оседал мусор вида 12.3400001
  const rounded = Math.round(num * 10) / 10;
  return { value: rounded, canonical: String(rounded) };
}

/**
 * Прибавляет значение быстрой кнопкой. Пустое поле считается нулём —
 * оператор может набрать «12 касаний» тремя тапами по +10, +1, +1.
 */
export function applyStep(
  activity: SportActivity,
  input: string,
  step: number,
): string {
  const ui = SPORT_UI[activity];
  if (ui.kind === 'binary') return input;

  const current = Number(input.trim().replace(',', '.'));
  const base = Number.isFinite(current) ? current : 0;
  const next = Math.min(ui.max, Math.max(ui.min, base + step));

  return ui.kind === 'integer'
    ? String(Math.round(next))
    : String(Math.round(next * 10) / 10);
}

/** Человекочитаемый результат для истории начислений и списка игроков. */
export function formatRawResult(
  activity: SportActivity,
  rawResult: string | null,
): string {
  if (!rawResult) return '—';
  const ui = SPORT_UI[activity];

  if (ui.kind === 'binary') {
    if (rawResult === GOAL_HIT) return ui.positiveLabel ?? 'Попал';
    if (rawResult === GOAL_MISS) return ui.negativeLabel ?? 'Не попал';
    return rawResult;
  }

  const num = Number(rawResult);
  if (!Number.isFinite(num)) return rawResult;

  const shown = ui.kind === 'seconds' ? String(num).replace('.', ',') : String(num);
  return ui.unit ? `${shown} ${ui.unit}` : shown;
}
