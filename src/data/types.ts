/**
 * Типы банка вопросов для квизов стенда Teboil.
 *
 * Данные лежат в `quiz1.json` (вариант 1 — 8 рубрик x 9 вопросов = 72)
 * и `quiz2.json` (вариант 2 — 7 тем, 21 вопрос, у каждого есть `fact`).
 *
 * Поля намеренно описаны широкими типами (`number`, `string[]`), чтобы
 * результат `import quiz from './quiz1.json'` присваивался в `Quiz`
 * без приведения типов. Для строгой проверки используйте `assertQuiz`.
 */

/** Сложность вопроса: 1 — лёгкий, 2 — средний, 3 — сложный. */
export type QuizLevel = 1 | 2 | 3;

export const LEVEL_LABELS: Record<QuizLevel, string> = {
  1: 'Лёгкий',
  2: 'Средний',
  3: 'Сложный',
};

/*
 * Баллы за уровни намеренно НЕ описаны здесь. Единственный источник правды —
 * `SCORING.quiz` в `src/lib/scoring.ts`: по нему считает сервер, и расхождение
 * между ним и копией на клиенте означало бы, что участник видит одни баллы,
 * а в лидерборд уходят другие.
 */

export interface QuizQuestion {
  /** Уникальный в пределах всего банка id, напр. `v1-warmup-1`. */
  id: string;
  /**
   * Исходная («тонкая») тема вопроса — дословно из источника,
   * напр. `Тебойл / Пит-стопы`. Есть только в quiz2: там на каждом уровне
   * ровно 7 вопросов с 7 разными темами, поэтому колесо можно собирать
   * отдельно для каждого уровня (см. `themesOfLevel`).
   * В quiz1 темы нет — там сектор задаётся `QuizTopic`.
   */
  theme?: string;
  /** Сложность: 1 | 2 | 3 (см. QuizLevel). */
  level: number;
  question: string;
  /** Всегда 4 варианта, чистый текст без префиксов «A.» / «А)». */
  options: string[];
  /** Индекс правильного варианта в `options`, 0..3. */
  correctIndex: number;
  /** Пояснение, которое показывается после ответа. `null`, если его нет. */
  fact: string | null;
}

/** Тема = сектор рулетки. */
export interface QuizTopic {
  id: string;
  title: string;
  questions: QuizQuestion[];
}

export interface Quiz {
  id: string;
  title: string;
  topics: QuizTopic[];
}

/** Все вопросы квиза одним списком. */
export function allQuestions(quiz: Quiz): QuizQuestion[] {
  return quiz.topics.flatMap((topic) => topic.questions);
}

/** Вопросы рубрики заданной сложности. */
export function questionsByLevel(topic: QuizTopic, level: QuizLevel): QuizQuestion[] {
  return topic.questions.filter((question) => question.level === level);
}

/** Все вопросы квиза заданной сложности, независимо от рубрики. */
export function questionsOfLevel(quiz: Quiz, level: QuizLevel): QuizQuestion[] {
  return allQuestions(quiz).filter((question) => question.level === level);
}

/**
 * Уникальные `theme` вопросов заданной сложности — сектора колеса для quiz2.
 * На каждом уровне ровно 7 тем и 7 вопросов, поэтому мёртвых секторов нет.
 */
export function themesOfLevel(quiz: Quiz, level: QuizLevel): string[] {
  const themes = questionsOfLevel(quiz, level)
    .map((question) => question.theme)
    .filter((theme): theme is string => Boolean(theme));

  return [...new Set(themes)];
}

/** Вопросы заданной сложности с указанной темой (для quiz2 — обычно ровно один). */
export function questionsByTheme(quiz: Quiz, level: QuizLevel, theme: string): QuizQuestion[] {
  return questionsOfLevel(quiz, level).filter((question) => question.theme === theme);
}

/**
 * Проверка данных на границе системы: структура, 4 варианта,
 * корректный индекс ответа, уникальность id. Бросает Error при нарушении.
 */
export function assertQuiz(quiz: Quiz, expectedQuestionCount?: number): Quiz {
  const seen = new Set<string>();

  if (!quiz.id || !quiz.title || !Array.isArray(quiz.topics) || quiz.topics.length === 0) {
    throw new Error('Quiz: пустой id/title или нет тем');
  }

  for (const topic of quiz.topics) {
    if (!topic.id || !topic.title || !Array.isArray(topic.questions) || topic.questions.length === 0) {
      throw new Error(`Topic "${topic?.id}": пустой id/title или нет вопросов`);
    }
    for (const question of topic.questions) {
      if (seen.has(question.id)) {
        throw new Error(`Question "${question.id}": дублирующийся id`);
      }
      seen.add(question.id);

      if (question.level !== 1 && question.level !== 2 && question.level !== 3) {
        throw new Error(`Question "${question.id}": level должен быть 1, 2 или 3`);
      }
      if (!question.question.trim()) {
        throw new Error(`Question "${question.id}": пустой текст вопроса`);
      }
      if (question.options.length !== 4 || question.options.some((option) => !option.trim())) {
        throw new Error(`Question "${question.id}": нужно ровно 4 непустых варианта`);
      }
      if (!Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex > 3) {
        throw new Error(`Question "${question.id}": correctIndex вне диапазона 0..3`);
      }
      if (new Set(question.options).size !== 4) {
        throw new Error(`Question "${question.id}": варианты ответа повторяются`);
      }
      if (question.theme !== undefined && !question.theme.trim()) {
        throw new Error(`Question "${question.id}": пустая theme`);
      }
    }
  }

  if (expectedQuestionCount !== undefined && seen.size !== expectedQuestionCount) {
    throw new Error(`Quiz "${quiz.id}": ожидалось ${expectedQuestionCount} вопросов, найдено ${seen.size}`);
  }

  return quiz;
}
