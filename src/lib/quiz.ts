import fs from 'node:fs';
import path from 'node:path';
import type { Activity, PublicQuizLevel, QuizVariant } from './types';
import { isQuizLevel, type QuizLevel } from './scoring';

/* ==========================================================================
   Квиз с рулеткой.

   Вопросы лежат в src/data/quiz1.json и quiz2.json (готовит контент-агент)
   и читаются ТОЛЬКО на сервере: ни правильный ответ, ни пояснение не уезжают
   на клиент, пока участник не ответил.

   Файлы сгруппированы по темам (topics), а игре нужна группировка по уровням:
   рулетка крутится перед каждым уровнем и показывает темы, у которых на этом
   уровне ещё остались вопросы. Преобразование живёт здесь.
   ========================================================================== */

const QUIZ_FILES: Record<QuizVariant, string> = {
  v1: 'quiz1.json',
  v2: 'quiz2.json',
};

/** Названия уровней из презентации; в самих файлах их нет. */
const LEVEL_TITLES: Record<QuizLevel, string> = {
  1: 'Новичок',
  2: 'Любитель',
  3: 'Профи',
};

interface RawQuestion {
  id: string;
  /** Тонкая тема из источника. Есть в quiz2, в quiz1 её роль играет тема-рубрика. */
  theme?: string;
  level: number;
  question: string;
  options: string[];
  correctIndex: number;
  /** Пояснение/брендовый факт — показывается ПОСЛЕ ответа. */
  fact?: string | null;
}

interface RawTopic {
  id: string;
  title: string;
  questions: RawQuestion[];
}

interface RawQuiz {
  id?: string;
  title?: string;
  topics: RawTopic[];
}

interface CacheEntry {
  mtimeMs: number;
  quiz: RawQuiz | null;
}

const cache = new Map<QuizVariant, CacheEntry>();

function quizPath(variant: QuizVariant): string {
  return path.join(process.cwd(), 'src', 'data', QUIZ_FILES[variant]);
}

function loadQuiz(variant: QuizVariant): RawQuiz | null {
  const file = quizPath(variant);
  try {
    const stat = fs.statSync(file);
    const hit = cache.get(variant);
    if (hit && hit.mtimeMs === stat.mtimeMs) return hit.quiz;

    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as RawQuiz;
    const quiz = Array.isArray(parsed?.topics) ? parsed : null;
    cache.set(variant, { mtimeMs: stat.mtimeMs, quiz });
    return quiz;
  } catch {
    return null;
  }
}

/** Вопрос вместе с темой, под которой он показывается на колесе. */
interface FlatQuestion extends RawQuestion {
  theme: string;
}

/**
 * Разворачивает темы в плоский список. Тема вопроса — это его собственное
 * поле `theme` (quiz2, дословные брендовые формулировки), а если его нет —
 * название рубрики (quiz1). Благодаря этому обе структуры дальше обрабатываются
 * одинаково.
 */
function flatten(quiz: RawQuiz): FlatQuestion[] {
  const out: FlatQuestion[] = [];
  for (const topic of quiz.topics ?? []) {
    for (const q of topic.questions ?? []) {
      if (!q || typeof q.id !== 'string' || !Array.isArray(q.options)) continue;
      if (!isQuizLevel(q.level)) continue;
      const theme = (q.theme ?? topic.title ?? '').trim();
      if (!theme) continue;
      out.push({ ...q, theme });
    }
  }
  return out;
}

export function isQuizVariant(value: unknown): value is QuizVariant {
  return value === 'v1' || value === 'v2';
}

/** Активность для журнала баллов по варианту квиза. */
export function quizActivity(variant: QuizVariant): Activity {
  return variant === 'v1' ? 'quiz_roulette_v1' : 'quiz_roulette_v2';
}

export interface PublicQuiz {
  variant: QuizVariant;
  title: string;
  levels: PublicQuizLevel[];
}

/**
 * Вопросы для участника: с темой (нужна колесу), но БЕЗ correctIndex и без
 * пояснения. Сгруппированы по уровням — по одному вращению рулетки на уровень.
 */
export function getPublicQuiz(variant: QuizVariant): PublicQuiz | null {
  const raw = loadQuiz(variant);
  if (!raw) return null;

  const questions = flatten(raw);
  if (questions.length === 0) return null;

  const levels: PublicQuizLevel[] = [];
  for (const level of [1, 2, 3] as const) {
    const atLevel = questions.filter((q) => q.level === level);
    if (atLevel.length === 0) continue;
    levels.push({
      level,
      title: LEVEL_TITLES[level],
      questions: atLevel.map((q) => ({
        id: q.id,
        theme: q.theme,
        question: q.question,
        options: q.options,
      })),
    });
  }
  if (levels.length === 0) return null;

  return { variant, title: raw.title ?? 'Квиз Teboil', levels };
}

export interface QuizQuestionLookup {
  level: QuizLevel;
  correctIndex: number;
  optionsCount: number;
  /** Показывается участнику только после ответа. */
  fact: string | null;
  theme: string;
}

/** Ищет вопрос по id внутри варианта. Только сервер. */
export function findQuizQuestion(
  variant: QuizVariant,
  questionId: string,
): QuizQuestionLookup | null {
  const raw = loadQuiz(variant);
  if (!raw) return null;

  const found = flatten(raw).find((q) => q.id === questionId);
  if (!found || !isQuizLevel(found.level)) return null;

  return {
    level: found.level,
    correctIndex: found.correctIndex,
    optionsCount: found.options.length,
    fact: found.fact ?? null,
    theme: found.theme,
  };
}

/** Сколько уровней реально наполнено в варианте (обычно 3). */
export function quizLevelCount(variant: QuizVariant): number {
  const raw = loadQuiz(variant);
  if (!raw) return 0;
  return new Set(flatten(raw).map((q) => q.level)).size;
}
