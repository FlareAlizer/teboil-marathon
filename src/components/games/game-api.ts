'use client';

/**
 * Клиент игровой части и память киоска о текущем участнике.
 *
 * Планшет передают из рук в руки, поэтому текущий игрок хранится в
 * localStorage: случайное обновление страницы посреди квиза не должно
 * выкидывать участника на экран входа.
 */

import type { ApiResponse, QuizVariant } from '@/lib/types';
import { HOUR, loadState, saveState } from '@/lib/persist';
import { deviceId, trace } from '@/lib/client-trace';

export { trace } from '@/lib/client-trace';

const PLAYER_KEY = 'teboil.player';

export interface CurrentPlayer {
  id: number;
  nickname: string;
  totalPoints: number;
  todayPoints: number;
}

export function loadPlayer(): CurrentPlayer | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PLAYER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CurrentPlayer;
    return typeof parsed?.id === 'number' && typeof parsed?.nickname === 'string'
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function savePlayer(player: CurrentPlayer): void {
  try {
    window.localStorage.setItem(PLAYER_KEY, JSON.stringify(player));
  } catch {
    // Приватный режим браузера — игра продолжится, просто без запоминания.
  }
}

export function clearPlayer(): void {
  try {
    window.localStorage.removeItem(PLAYER_KEY);
  } catch {
    /* см. savePlayer */
  }
}

/* ---------------------------------- HTTP ---------------------------------- */

export class GameApiError extends Error {}

/** Сколько ждём ответа. Без предела «Загружаем вопросы…» на плохой сети висело бы минутами. */
const TIMEOUT_MS = 12_000;

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Метка устройства: по ней события сервера склеиваются с отметками телефона.
  const headers = new Headers(init?.headers);
  headers.set('X-Device', deviceId());
  try {
    return await fetch(url, { cache: 'no-store', ...init, headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Адрес без параметров — для отметок: что именно не ответило. */
function pathOf(url: string): string {
  return url.split('?')[0];
}

async function request<T>(
  url: string,
  init?: RequestInit,
  attempts = 3,
  timeoutMs = TIMEOUT_MS,
): Promise<T> {
  let response: Response;

  // Повторяем сами всё, включая отправку: мобильная сеть на площадке теряет
  // отдельные запросы. Это безопасно, потому что каждый запрос игры на
  // сервере повторяемый — вход находит того же участника, ответ на вопрос и
  // бонус засчитываются один раз, а на повтор сервер отдаёт прежний итог.
  const started = Date.now();
  for (let attempt = 1; ; attempt += 1) {
    try {
      response = await fetchWithTimeout(url, init, timeoutMs);
      break;
    } catch (e) {
      const reason = e instanceof Error ? e.name : 'error';
      if (attempt >= attempts) {
        trace('net_fail', { url: pathOf(url), attempts, reason, ms: Date.now() - started });
        throw new GameApiError('Нет связи с сервером. Проверь интернет и попробуй ещё раз');
      }
      trace('net_retry', { url: pathOf(url), attempt, reason });
      await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
    }
  }

  const ms = Date.now() - started;
  // Медленный ответ — первый признак перегрузки или плохой сети на площадке.
  if (ms > 5000) trace('slow', { url: pathOf(url), ms, status: response.status });

  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    payload = null;
  }

  if (payload && payload.ok) return payload.data;
  const message = payload && !payload.ok ? payload.error : 'Не удалось выполнить запрос';
  // Ровно то, что человек увидит на экране, и код ответа.
  trace('api_fail', { url: pathOf(url), status: response.status, error: message });
  throw new GameApiError(message);
}

function post<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Что-то пошло не так';
}

/* ----------------------------------- Вход ---------------------------------- */

export interface LoginResponse extends CurrentPlayer {
  created: boolean;
}

export function login(nickname: string): Promise<LoginResponse> {
  return post<LoginResponse>('/api/players', { nickname });
}

/**
 * Сверка участника из памяти устройства с сервером при открытии сайта.
 *
 * - 'gone' — такого участника на сервере нет (база сброшена, участника
 *   удалили): без этой проверки каждый ответ получал бы 404 «Участник не
 *   найден», и выйти можно было бы только кнопкой «Следующий участник»;
 * - данные — свежие баллы: назавтра в шапке не должно висеть вчерашнее число;
 * - null — сервер не ответил: играем дальше с тем, что есть, без ошибок.
 *
 * Один короткий запрос без повторов: открытие сайта он не задерживает.
 */
export async function checkPlayer(
  id: number,
): Promise<'gone' | Pick<CurrentPlayer, 'nickname' | 'totalPoints' | 'todayPoints'> | null> {
  try {
    const response = await fetchWithTimeout(`/api/players/${id}`, undefined, 6000);
    if (response.status === 404) return 'gone';
    if (!response.ok) return null;
    const payload = (await response.json()) as ApiResponse<CurrentPlayer>;
    if (!payload.ok) return null;
    const { nickname, totalPoints, todayPoints } = payload.data;
    return { nickname, totalPoints, todayPoints };
  } catch {
    return null;
  }
}

/* ----------------------------- Квиз с рулеткой ----------------------------- */

export interface QuizQuestionView {
  id: string;
  theme: string;
  question: string;
  options: string[];
}

export interface QuizLevelView {
  level: 1 | 2 | 3;
  title: string;
  questions: QuizQuestionView[];
}

export interface QuizRules {
  levelPoints: Record<1 | 2 | 3, number>;
  allLevelsBonus: number;
  /** Доля цены уровня, которая снимается за неверный ответ. */
  wrongAnswerShare: number;
  betFromLevel: number;
  betMultiplier: number;
}

/**
 * Сколько снимется за ошибку на этом уровне. Считается из правил сервера,
 * а не своей константой: расхождение означало бы, что участнику обещают
 * одно, а списывают другое.
 */
export function penaltyFor(rules: QuizRules, level: 1 | 2 | 3): number {
  return Math.round(rules.levelPoints[level] * rules.wrongAnswerShare);
}

export interface QuizData {
  variant: QuizVariant;
  title: string;
  levels: QuizLevelView[];
  rules: QuizRules;
  /**
   * Вопросы, на которые участник уже отвечал (в любой день). Квиз исключает их из
   * выборки: повторный заход должен начинаться с новых вопросов, а за
   * повторный ответ сервер всё равно не начислит баллы.
   */
  answeredIds: string[];
  /** Вопросы открыты из памяти устройства: сервер не ответил. */
  fromCache?: boolean;
  /** Метка последнего сброса рейтинга квизов — см. quiz-progress.ts. */
  epoch?: string | null;
}

/** Вопросы на устройстве живут сутки: дольше банк вопросов может поменяться. */
const QUIZ_CACHE_AGE = 24 * HOUR;

/**
 * Вопросы квиза. Свежие берём с сервера и сразу кладём копию на устройство;
 * если сервер не ответил — открываем квиз из этой копии.
 *
 * Хранить их на телефоне безопасно: правильных ответов в списке нет, они
 * приходят с сервера только после ответа участника. Поэтому открыть квиз
 * без сети можно, а вот проверить ответ — только со связью.
 *
 * Когда копия уже есть, сервер ждём недолго и один раз: человеку лучше сразу
 * увидеть вопросы из памяти, чем полминуты смотреть на «Загружаем…».
 */
export async function getQuiz(variant: QuizVariant, playerId?: number): Promise<QuizData> {
  const key = `teboil.quiz.${variant}`;
  const cached = loadState<Omit<QuizData, 'answeredIds'>>(key, QUIZ_CACHE_AGE);
  const query = playerId ? `&playerId=${playerId}` : '';

  try {
    const fresh = await request<QuizData>(
      `/api/quiz?variant=${variant}${query}`,
      undefined,
      cached ? 1 : 3,
      cached ? 4000 : TIMEOUT_MS,
    );
    const { answeredIds: _answered, ...shared } = fresh;
    void _answered;
    saveState(key, shared);
    return fresh;
  } catch (error) {
    if (!cached) throw error;
    // Какие вопросы уже отвечены, без сервера не узнать — это допишет экран
    // квиза из своей памяти (см. quiz-progress.ts).
    return { ...cached, answeredIds: [], fromCache: true };
  }
}

export interface QuizAnswerResponse {
  correct: boolean;
  correctIndex: number;
  fact: string | null;
  level: 1 | 2 | 3;
  points: number;
  betApplied: boolean;
  prizesLost: boolean;
  alreadyAnswered: boolean;
  totalPoints: number | null;
  todayPoints: number | null;
}

/** Проверка ответа и начисление — только на сервере. */
export function answerQuiz(input: {
  playerId: number;
  variant: QuizVariant;
  questionId: string;
  answerIndex: number;
  bet: boolean;
}): Promise<QuizAnswerResponse> {
  return post<QuizAnswerResponse>('/api/quiz/answer', input);
}

export interface QuizCompleteResponse {
  awarded: boolean;
  bonus: number;
  levelsPassed: number;
  totalPoints: number;
  todayPoints: number;
}

export function completeQuiz(
  playerId: number,
  variant: QuizVariant,
): Promise<QuizCompleteResponse> {
  return post<QuizCompleteResponse>('/api/quiz/complete', { playerId, variant });
}


