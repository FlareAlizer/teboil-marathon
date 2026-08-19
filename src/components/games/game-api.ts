'use client';

/**
 * Клиент игровой части и память киоска о текущем участнике.
 *
 * Планшет передают из рук в руки, поэтому текущий игрок хранится в
 * localStorage: случайное обновление страницы посреди квиза не должно
 * выкидывать участника на экран входа.
 */

import type { ApiResponse, QuizVariant } from '@/lib/types';

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

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-store', ...init });
  } catch {
    throw new GameApiError('Нет связи с сервером стенда');
  }

  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    payload = null;
  }

  if (payload && payload.ok) return payload.data;
  throw new GameApiError(
    payload && !payload.ok ? payload.error : 'Не удалось выполнить запрос',
  );
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
  betFromLevel: number;
  betMultiplier: number;
}

export interface QuizData {
  variant: QuizVariant;
  title: string;
  levels: QuizLevelView[];
  rules: QuizRules;
}

export function getQuiz(variant: QuizVariant): Promise<QuizData> {
  return request<QuizData>(`/api/quiz?variant=${variant}`);
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

