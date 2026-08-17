import type { Activity, SportActivity } from './types';

/* ==========================================================================
   ПРАВИЛА НАЧИСЛЕНИЯ БАЛЛОВ
   Всё, что может понадобиться поправить на площадке, лежит здесь, сверху.
   ========================================================================== */

export const SCORING = {
  /** Квиз с рулеткой (начисляется автоматически). */
  quiz: {
    /** Базовые баллы за верный ответ на уровне. */
    levelPoints: { 1: 10, 2: 20, 3: 30 } as Record<1 | 2 | 3, number>,
    /** Бонус за прохождение всех трёх уровней. */
    allLevelsBonus: 40,
    /** Ставка «призами» доступна начиная с этого уровня. */
    betFromLevel: 2 as 2,
    /** Во сколько раз ставка увеличивает баллы уровня при выигрыше. */
    betMultiplier: 2,
  },

  /** Фото-квиз (автоматически). */
  photoQuiz: {
    correct: 25,
    wrong: 0,
  },

  /** Спорт-активности — оператор вводит результат, баллы предлагаются. */
  sport: {
    /** Чеканка: 1 балл за касание, но не больше максимума. */
    sport_keepups: { perTouch: 1, max: 50 },
    /** Полоса препятствий: чем быстрее, тем больше. */
    sport_obstacle: { base: 60, min: 10 },
    /** Забей гол. */
    sport_goal: { hit: 25, miss: 5 },
    /** Дартс: половина набранных очков. */
    sport_darts: { divisor: 2 },
  },

  /** Границы для ручного начисления оператором (защита от опечаток). */
  manual: { min: 0, max: 200 },
} as const;

/* ==========================================================================
   Квиз с рулеткой
   ========================================================================== */

export type QuizLevel = 1 | 2 | 3;

export function isQuizLevel(value: unknown): value is QuizLevel {
  return value === 1 || value === 2 || value === 3;
}

/** Можно ли на этом уровне ставить призы. */
export function canBet(level: QuizLevel): boolean {
  return level >= SCORING.quiz.betFromLevel;
}

export interface QuizAnswerOutcome {
  /** Сколько баллов начислить за этот ответ. */
  points: number;
  /** Сгорели ли призы участника (проигранная ставка). */
  prizesLost: boolean;
  /** Была ли ставка реально принята (на 1 уровне ставка невозможна). */
  betApplied: boolean;
}

/**
 * Баллы за один ответ в квизе с рулеткой.
 *
 * Механика риска: на уровнях 2 и 3 участник может «поставить» призы.
 * Выигрыш — баллы уровня удваиваются. Проигрыш — ПРИЗЫ сгорают,
 * но уже НАБРАННЫЕ БАЛЛЫ остаются (мы просто не начисляем баллы за уровень).
 */
export function quizAnswerPoints(
  level: QuizLevel,
  correct: boolean,
  bet: boolean,
): QuizAnswerOutcome {
  const betApplied = bet && canBet(level);
  if (!correct) {
    return { points: 0, prizesLost: betApplied, betApplied };
  }
  const base = SCORING.quiz.levelPoints[level];
  return {
    points: betApplied ? base * SCORING.quiz.betMultiplier : base,
    prizesLost: false,
    betApplied,
  };
}

/** Бонус за прохождение всех трёх уровней. */
export function quizCompletionBonus(): number {
  return SCORING.quiz.allLevelsBonus;
}

/* ==========================================================================
   Фото-квиз
   ========================================================================== */

export function photoQuizPoints(correct: boolean, questionPoints?: number): number {
  if (!correct) return SCORING.photoQuiz.wrong;
  return questionPoints ?? SCORING.photoQuiz.correct;
}

/* ==========================================================================
   Спорт-активности
   ========================================================================== */

/** Считает ли мы сырой результат «попаданием» (для «забей гол»). */
function isHit(rawResult: string | number | boolean): boolean {
  if (typeof rawResult === 'boolean') return rawResult;
  if (typeof rawResult === 'number') return rawResult > 0;
  const v = rawResult.trim().toLowerCase();
  return ['hit', 'goal', 'yes', 'true', '1', 'попал', 'да', 'гол'].includes(v);
}

function toNumber(rawResult: string | number | boolean): number {
  if (typeof rawResult === 'number') return rawResult;
  if (typeof rawResult === 'boolean') return rawResult ? 1 : 0;
  const n = Number(String(rawResult).replace(',', '.').trim());
  return Number.isFinite(n) ? n : 0;
}

export function isSportActivity(activity: Activity): activity is SportActivity {
  return activity.startsWith('sport_');
}

/**
 * ПРЕДЛАГАЕМЫЕ баллы за спорт-активность. Оператор всегда может перебить
 * значение вручную — эта функция только подставляет число в форму.
 */
export function suggestPoints(
  activity: Activity,
  rawResult: string | number | boolean,
): number {
  switch (activity) {
    case 'sport_keepups': {
      const { perTouch, max } = SCORING.sport.sport_keepups;
      const touches = Math.max(0, Math.floor(toNumber(rawResult)));
      return Math.min(max, touches * perTouch);
    }
    case 'sport_obstacle': {
      const { base, min } = SCORING.sport.sport_obstacle;
      const seconds = Math.max(0, toNumber(rawResult));
      return Math.max(min, Math.round(base - seconds));
    }
    case 'sport_goal': {
      const { hit, miss } = SCORING.sport.sport_goal;
      return isHit(rawResult) ? hit : miss;
    }
    case 'sport_darts': {
      const { divisor } = SCORING.sport.sport_darts;
      const score = Math.max(0, toNumber(rawResult));
      return Math.round(score / divisor);
    }
    case 'photo_quiz':
      return SCORING.photoQuiz.correct;
    case 'quiz_roulette_v1':
    case 'quiz_roulette_v2':
      return SCORING.quiz.levelPoints[1];
    default:
      return 0;
  }
}

/** Проверка значения, которое оператор ввёл руками. */
export function isValidManualPoints(points: number): boolean {
  return (
    Number.isInteger(points) &&
    points >= SCORING.manual.min &&
    points <= SCORING.manual.max
  );
}
