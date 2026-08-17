/**
 * Свод прогресса участника по станциям — чистая функция без запросов и React,
 * чтобы её было видно и легко проверить отдельно от вёрстки.
 *
 * В макете пять строк: Квиз, Бутсы, Полоса препятствий, Забей гол, Дартс.
 * В данных квизов три вида (`quiz_roulette_v1`, `quiz_roulette_v2`,
 * `photo_quiz`) — в строке «Квиз» они схлопнуты в одну сумму, иначе список
 * на экране не совпал бы с макетом.
 */

import type { Activity, ScoreEvent } from '@/lib/types';

export const STATION_IDS = [
  'quiz',
  'sport_keepups',
  'sport_obstacle',
  'sport_goal',
  'sport_darts',
] as const;

export type StationId = (typeof STATION_IDS)[number];

/** Какие активности из данных попадают в какую строку экрана. */
const STATION_ACTIVITIES: Record<StationId, readonly Activity[]> = {
  quiz: ['quiz_roulette_v1', 'quiz_roulette_v2', 'photo_quiz'],
  sport_keepups: ['sport_keepups'],
  sport_obstacle: ['sport_obstacle'],
  sport_goal: ['sport_goal'],
  sport_darts: ['sport_darts'],
};

export const STATION_TITLES: Record<StationId, string> = {
  quiz: 'Квиз',
  sport_keepups: 'Бутсы',
  sport_obstacle: 'Полоса препятствий',
  sport_goal: 'Забей гол',
  sport_darts: 'Дартс',
};

/**
 * Знаменатель строки «N из M» — только там, где он существует на самом деле.
 *
 * Квиз: три уровня, число задано данными квиза и от регламента стенда не
 * зависит.
 *
 * Гол и дартс: числа попыток взяты из макета. Учтите, что макет здесь
 * противоречит сам себе — на экране станций у гола «0 из 3», а на экране
 * эстафеты «Попыток 1». Выбран вариант с того экрана, где счётчик и
 * показывается, то есть со станций.
 *
 * Чеканка и полоса: `null` намеренно. Их результат — это количество касаний и
 * время, а не число попыток, поэтому «из M» для них не существует, и экран
 * показывает «пройдено / не пройдено». Выдуманное «0 из 1» было бы фальшивой
 * точностью на экране участника.
 */
const STATION_TOTALS: Record<StationId, number | null> = {
  quiz: 3,
  sport_keepups: null,
  sport_obstacle: null,
  sport_goal: 3,
  sport_darts: 5,
};

export interface StationProgress {
  id: StationId;
  title: string;
  /** Сколько начислений уже есть по станции. */
  done: number;
  /** Сколько всего этапов, если это известно. `null` — показываем факт прохождения. */
  total: number | null;
  /** Сумма баллов, набранных на этой станции. */
  points: number;
}

/**
 * Считает пять строк экрана по событиям игрока.
 *
 * Всегда возвращает ровно пять строк в порядке макета — даже если участник
 * ещё нигде не играл. Пустая станция показывается нулями, а не исчезает:
 * человек должен видеть, что ему ещё доступно.
 */
/**
 * Сколько уровней квиза реально пройдено.
 *
 * Считаем РАЗНЫЕ уровни, отвеченные ВЕРНО, а не число ответов. Иначе неверный
 * ответ прибавлял бы прогресс наравне с верным: участник отвечает на вопрос
 * первого уровня, ошибается на втором — и видит «2 из 3», хотя прошёл один.
 * Повторные попытки по той же причине не должны накручивать счётчик.
 */
function levelsPassed(events: readonly ScoreEvent[]): number {
  const levels = new Set<number>();
  for (const event of events) {
    if (event.meta?.kind !== 'answer' || event.meta?.correct !== true) continue;
    const level = Number(event.meta?.level);
    if (level === 1 || level === 2 || level === 3) levels.add(level);
  }
  return levels.size;
}

export function stationsFromEvents(
  events: readonly ScoreEvent[],
): StationProgress[] {
  return STATION_IDS.map((id) => {
    const activities = STATION_ACTIVITIES[id];
    const own = events.filter((event) => activities.includes(event.activity));
    const total = STATION_TOTALS[id];

    // У квиза прогресс измеряется уровнями, у остальных станций — попытками.
    const done =
      id === 'quiz'
        ? levelsPassed(own)
        : total === null
          ? own.length
          : Math.min(own.length, total);

    return {
      id,
      title: STATION_TITLES[id],
      done,
      total,
      points: own.reduce((sum, event) => sum + event.points, 0),
    };
  });
}
