import type { QuizVariant } from '@/lib/types';
import { HOUR, clearState, loadState, saveState } from '@/lib/persist';
import type { QuizAnswerResponse } from './game-api';

/**
 * Место участника в квизе, пережившее перезагрузку страницы.
 *
 * Телефон гасит экран или сеть моргает, страница загружается заново — и без
 * этой записи человек оказался бы на заставке квиза, потеряв выбранный
 * уровень, рубрику и вопрос, на котором остановился. Баллы при этом не
 * терялись и раньше (они на сервере), терялось именно место.
 *
 * Запись живёт три часа и привязана к участнику и варианту квиза: чужой или
 * вчерашний прогресс не восстановится.
 */

export type SavedPhase = 'intro' | 'levelPick' | 'wheel' | 'themes' | 'question' | 'topicDone';

export interface QuizProgress {
  phase: SavedPhase;
  level: 1 | 2 | 3;
  theme: string | null;
  /** Вопрос на экране. Сам вопрос берётся из загруженного квиза по id. */
  questionId: string | null;
  /** Вопросы, на которые участник уже ответил, — нужны, когда квиз открыт без сети. */
  askedIds: string[];
  /** Выбранный вариант и ответ сервера — только если ответ уже получен. */
  chosen: number | null;
  result: QuizAnswerResponse | null;
  topicTotal: number;
  topic: { asked: number; correct: number; earned: number };
  points: number;
  bonus: number;
  /** Метка сброса рейтинга квизов, при которой сохранено это место. */
  epoch?: string | null;
}

const MAX_AGE = 3 * HOUR;

function key(playerId: number, variant: QuizVariant): string {
  return `teboil.quizprogress.${playerId}.${variant}`;
}

/**
 * `epoch` — метка последнего сброса рейтинга квизов с сервера. Если с момента
 * сохранения рейтинг сбросили (новый розыгрыш), место в квизе выбрасывается:
 * участник начинает заново и снова видит все вопросы. `undefined` — сервер
 * не ответил, метка неизвестна: тогда верим тому, что сохранено.
 */
export function loadProgress(
  playerId: number,
  variant: QuizVariant,
  epoch?: string | null,
): QuizProgress | null {
  const saved = loadState<QuizProgress>(key(playerId, variant), MAX_AGE);
  // Запись могла остаться от старой версии сайта — проверяем самое нужное.
  if (!saved || !Array.isArray(saved.askedIds) || typeof saved.phase !== 'string') return null;
  if (epoch !== undefined && (saved.epoch ?? null) !== epoch) {
    clearState(key(playerId, variant));
    return null;
  }
  return saved;
}

export function saveProgress(playerId: number, variant: QuizVariant, progress: QuizProgress): void {
  saveState(key(playerId, variant), progress);
}

/** Участник сам ушёл из квиза или сменился — место больше не нужно. */
export function clearProgress(playerId: number, variant?: QuizVariant): void {
  for (const v of variant ? [variant] : (['v1', 'v2'] as const)) clearState(key(playerId, v));
}
