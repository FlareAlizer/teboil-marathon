import type { SportActivity } from '@/lib/types';
import { ratingUnit, type RatingId } from '@/lib/rating-defs';

/**
 * Три станции, на которых сидят волонтёры. Порядок — как плитки на экране.
 *
 * «Забей гол» отдельной станцией больше нет: удар по воротам — финал
 * полосы препятствий, и его исход входит в итоговое время (штраф за промах).
 * Старые записи «Забей гол» остаются в базе и в выгрузке.
 */
export type StationId = Exclude<RatingId, 'quiz'>;

export interface StationConfig {
  id: StationId;
  activity: SportActivity;
  title: string;
  /** Что именно засчитывается — подсказка волонтёру прямо на плитке. */
  rule: string;
  /** Как вводится результат. */
  input: 'count' | 'obstacle';
  /** Подпись к числу на экране ввода. */
  unit: string;
  /** Верхняя граница ввода — защита от лишнего нуля. */
  max: number;
}

export const STATIONS: Record<StationId, StationConfig> = {
  keepups: {
    id: 'keepups',
    activity: 'sport_keepups',
    title: 'Чеканка',
    rule: 'Сколько раз набил мяч без падения',
    input: 'count',
    unit: 'касаний',
    max: 999,
  },
  darts: {
    id: 'darts',
    activity: 'sport_darts',
    title: 'Дартс',
    rule: 'Сумма очков за серию бросков',
    input: 'count',
    unit: 'очков',
    max: 999,
  },
  obstacle: {
    id: 'obstacle',
    activity: 'sport_obstacle',
    title: 'Полоса препятствий',
    rule: 'Время змейки между фишками + удар по воротам',
    input: 'obstacle',
    unit: 'сек',
    max: 999,
  },
};

export const STATION_ORDER: StationId[] = ['keepups', 'darts', 'obstacle'];

const STORAGE_KEY = 'teboil.admin.station';

/**
 * Волонтёр сидит на одной станции весь день. Запоминаем выбор, чтобы после
 * перезагрузки страницы или истёкшей сессии он сразу оказался у себя, а не
 * выбирал станцию заново в очереди.
 */
export function loadStation(): StationId | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value && value in STATIONS ? (value as StationId) : null;
  } catch {
    return null;
  }
}

export function saveStation(id: StationId | null): void {
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Приватный режим: просто не запомним.
  }
}

/** Единица с правильным окончанием: подтверждение читают участнику вслух. */
export function unitFor(id: StationId, value: number): string {
  return ratingUnit(id, value);
}
