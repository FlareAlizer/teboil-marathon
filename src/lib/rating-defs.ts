import type { Activity } from './types';

/* ==========================================================================
   Четыре рейтинга стенда.

   Раньше был один общий лидерборд по сумме всех баллов, и в нём квиз
   смешивался со спортом: кто много отвечал, обгонял того, кто лучше всех
   чеканил, и наоборот. Теперь у каждой дисциплины своя таблица и своя мера:

   - квиз — сумма баллов за ответы (оба варианта квиза);
   - чеканка — лучшая попытка, касаний;
   - дартс — лучшая попытка, очков;
   - полоса — лучшее итоговое время, секунд (меньше — лучше).

   В спорте считается ЛУЧШАЯ попытка, а не сумма: иначе выигрывал бы тот,
   кто чаще вставал в очередь, а не тот, кто лучше выступил.

   Файл без серверных зависимостей: его читают и сервер, и телевизор,
   и панель волонтёра — названия и единицы не должны разъехаться.
   ========================================================================== */

export const RATING_IDS = ['quiz', 'keepups', 'darts', 'obstacle'] as const;

export type RatingId = (typeof RATING_IDS)[number];

export interface RatingDef {
  id: RatingId;
  title: string;
  /** Какие начисления попадают в рейтинг. */
  activities: readonly Activity[];
  /**
   * Как свести попытки участника в одно число:
   * sum — сумма баллов, max — лучшая (наибольшая) попытка,
   * min — лучшая (наименьшая) попытка.
   */
  mode: 'sum' | 'max' | 'min';
  /** Подпись к числу: «баллов», «касаний»… Для полосы — секунды. */
  unit: string;
}

export const RATINGS: Record<RatingId, RatingDef> = {
  quiz: {
    id: 'quiz',
    title: 'Квиз',
    activities: ['quiz_roulette_v1', 'quiz_roulette_v2'],
    mode: 'sum',
    unit: 'баллов',
  },
  keepups: {
    id: 'keepups',
    title: 'Чеканка',
    activities: ['sport_keepups'],
    mode: 'max',
    unit: 'касаний',
  },
  darts: {
    id: 'darts',
    title: 'Дартс',
    activities: ['sport_darts'],
    mode: 'max',
    unit: 'очков',
  },
  obstacle: {
    id: 'obstacle',
    title: 'Полоса препятствий',
    activities: ['sport_obstacle'],
    mode: 'min',
    unit: 'сек',
  },
};

export function isRatingId(value: unknown): value is RatingId {
  return typeof value === 'string' && (RATING_IDS as readonly string[]).includes(value);
}

/** Строка рейтинга. `value` — баллы, касания, очки или секунды. */
export interface RatingRow {
  rank: number;
  id: number;
  nickname: string;
  value: number;
  /** Только для полосы: забит ли мяч в лучшей попытке. */
  goal: boolean | null;
}

export interface RatingBoard {
  id: RatingId;
  title: string;
  unit: string;
  rows: RatingRow[];
}

/** Место и результат одного участника в рейтинге. */
export interface PlayerRating {
  rank: number;
  value: number;
  goal: boolean | null;
  /** Сколько всего человек в этом рейтинге за день. */
  of: number;
}

/**
 * Число для экрана: секунды с запятой и одной цифрой после неё («23,4»),
 * остальное — целым.
 */
export function formatRatingValue(id: RatingId, value: number): string {
  if (id === 'obstacle') return value.toFixed(1).replace('.', ',');
  return String(Math.round(value));
}

/** Запись на станции — для экрана волонтёра. */
export interface StationEntry {
  eventId: number;
  playerId: number;
  nickname: string;
  /** Итог: касания, очки или итоговое время полосы со штрафом. */
  value: number | null;
  /** Полоса: чистое время и гол — чтобы волонтёр видел, из чего сложился итог. */
  timeSec: number | null;
  goal: boolean | null;
  points: number;
  createdAt: string;
}

/** Формы единицы: «1 касание», «34 касания», «45 касаний». */
const UNIT_FORMS: Record<RatingId, [string, string, string]> = {
  quiz: ['балл', 'балла', 'баллов'],
  keepups: ['касание', 'касания', 'касаний'],
  darts: ['очко', 'очка', 'очков'],
  obstacle: ['сек', 'сек', 'сек'],
};

/** Единица с правильным окончанием для конкретного числа. */
export function ratingUnit(id: RatingId, value: number): string {
  const [one, few, many] = UNIT_FORMS[id];
  if (!Number.isInteger(value)) return many;
  const n = Math.abs(value);
  if (n % 100 >= 11 && n % 100 <= 14) return many;
  if (n % 10 === 1) return one;
  if (n % 10 >= 2 && n % 10 <= 4) return few;
  return many;
}
