/** Общие типы предметной области. Импортируется и сервером, и клиентом. */

export const ACTIVITIES = [
  'quiz_roulette_v1',
  'quiz_roulette_v2',
  'photo_quiz',
  'sport_keepups',
  'sport_obstacle',
  'sport_goal',
  'sport_darts',
  /**
   * Ручное начисление оператором вне четырёх активностей. Намеренно вынесено
   * в отдельное значение: иначе нестандартные ситуации оседали бы в статистике
   * какой-нибудь чеканки и искажали отчёт по дню.
   */
  'manual',
] as const;

export type Activity = (typeof ACTIVITIES)[number];

export const SPORT_ACTIVITIES = [
  'sport_keepups',
  'sport_obstacle',
  'sport_goal',
  'sport_darts',
] as const satisfies readonly Activity[];

export type SportActivity = (typeof SPORT_ACTIVITIES)[number];

export const QUIZ_ACTIVITIES = [
  'quiz_roulette_v1',
  'quiz_roulette_v2',
  'photo_quiz',
] as const satisfies readonly Activity[];

/** Русские подписи для админки, лидерборда и игровых экранов. */
export const ACTIVITY_LABELS: Record<Activity, string> = {
  quiz_roulette_v1: 'Квиз с рулеткой (вариант 1)',
  quiz_roulette_v2: 'Квиз с рулеткой (вариант 2)',
  photo_quiz: 'Фото-квиз',
  sport_keepups: 'Чеканка мяча',
  sport_obstacle: 'Полоса препятствий',
  sport_goal: 'Забей гол',
  sport_darts: 'Дартс',
  manual: 'Начислено вручную',
};

/** Что оператор вводит как «сырой результат» для каждой спорт-активности. */
export const SPORT_INPUT_HINTS: Record<SportActivity, string> = {
  sport_keepups: 'Количество касаний',
  sport_obstacle: 'Время в секундах (меньше — лучше)',
  sport_goal: 'Попал или не попал',
  sport_darts: 'Набранные очки',
};

export type CreatedBy = 'auto' | 'admin';

export interface Player {
  id: number;
  nickname: string;
  createdAt: string;
  eventDay: string;
}

export interface ScoreEvent {
  id: number;
  playerId: number;
  activity: Activity;
  points: number;
  rawResult: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
  createdBy: CreatedBy;
}

export interface PlayerSummary {
  id: number;
  nickname: string;
  totalPoints: number;
  todayPoints: number;
}

export interface LeaderboardRow {
  rank: number;
  id: number;
  nickname: string;
  points: number;
  firstEventAt: string;
}

/** Фото-вопрос в том виде, в котором он уходит участнику: без correctIndex. */
export interface PublicPhotoQuestion {
  id: number;
  imagePath: string;
  question: string;
  options: string[];
  points: number;
}

export interface AdminPhotoQuestion extends PublicPhotoQuestion {
  correctIndex: number;
  active: boolean;
}

/** Квиз с рулеткой: вопрос без правильного ответа. */
export interface PublicQuizQuestion {
  id: string;
  /** Тема, под которой вопрос показывается на секторе рулетки. */
  theme: string;
  question: string;
  options: string[];
}

export interface PublicQuizLevel {
  level: 1 | 2 | 3;
  title: string;
  questions: PublicQuizQuestion[];
}

export type QuizVariant = 'v1' | 'v2';

export interface DayStats {
  day: string;
  totalVisitors: number;
  quizPlayers: number;
  sportPlayers: number;
  totalPoints: number;
  byActivity: Record<Activity, { events: number; players: number; points: number }>;
}

/** Единый конверт ответа API. */
export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };
