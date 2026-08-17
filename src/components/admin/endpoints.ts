'use client';

/**
 * Все обращения админки и лидерборда к API — в одном месте.
 * Если контракт поменяется, правится только этот файл, а не десяток экранов.
 * Формы ответов сверены с обработчиками в src/app/api.
 */

import type {
  Activity,
  AdminPhotoQuestion,
  DayStats,
  LeaderboardRow,
  PlayerSummary,
  ScoreEvent,
} from '@/lib/types';
import { adminFetch, adminPost } from './admin-api';

/* --------------------------------- Сессия -------------------------------- */

/**
 * Жив ли вход оператора. Эндпоинт всегда отвечает 200, поэтому обычный
 * fetch: показывать форму входа тут решаем мы сами, а не обработчик 401.
 */
export async function checkSession(): Promise<boolean> {
  try {
    const data = await adminFetch<{ authenticated: boolean }>('/api/admin/session');
    return data.authenticated;
  } catch {
    return false;
  }
}

/* --------------------------------- Игроки -------------------------------- */

/** Пустой запрос возвращает участников сегодняшнего дня. */
export async function searchPlayers(q: string, limit = 20): Promise<PlayerSummary[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (q) params.set('q', q);
  const data = await adminFetch<{ players: PlayerSummary[] }>(
    `/api/players/search?${params.toString()}`,
  );
  return data.players;
}

/**
 * Завести участника вручную — для тех, у кого нет юзернейма в Телеграме.
 * На киоске формат строгий, поэтому такой человек может попасть в игру
 * только через оператора.
 */
export function createPlayerManually(nickname: string): Promise<PlayerSummary> {
  return adminPost<PlayerSummary>('/api/players/manual', { nickname });
}

export interface PlayerCard {
  id: number;
  nickname: string;
  createdAt: string;
  eventDay: string;
  totalPoints: number;
  todayPoints: number;
  rank: number | null;
  events: ScoreEvent[];
}

export function getPlayer(id: number): Promise<PlayerCard> {
  return adminFetch<PlayerCard>(`/api/players/${id}`);
}

/* --------------------------------- Баллы --------------------------------- */

export interface ScoreResult {
  event: ScoreEvent;
  totalPoints: number;
  todayPoints: number;
}

export interface AddScoreInput {
  playerId: number;
  activity: Activity;
  points: number;
  rawResult?: string | null;
  meta?: Record<string, unknown> | null;
}

/** Начисление оператором: createdBy всегда 'admin', иначе сервер не спросит сессию. */
export function addScore(input: AddScoreInput): Promise<ScoreResult> {
  return adminPost<ScoreResult>('/api/score', { ...input, createdBy: 'admin' });
}

export interface DeleteScoreResult {
  deleted: number;
  playerId: number;
  points: number;
  totalPoints: number;
  todayPoints: number;
}

/** Отмена ошибочного начисления. */
export function deleteScore(id: number): Promise<DeleteScoreResult> {
  return adminFetch<DeleteScoreResult>(`/api/score?id=${id}`, { method: 'DELETE' });
}

/* ------------------------------- Статистика ------------------------------- */

export function getStats(day?: string): Promise<DayStats> {
  const qs = day ? `?day=${encodeURIComponent(day)}` : '';
  return adminFetch<DayStats>(`/api/stats${qs}`);
}

/* ------------------------------- Лидерборд -------------------------------- */

export interface LeaderboardData {
  day: string;
  updatedAt: string;
  rows: LeaderboardRow[];
}

export function getLeaderboard(limit = 10): Promise<LeaderboardData> {
  return adminFetch<LeaderboardData>(`/api/leaderboard?limit=${limit}`);
}

/* ------------------------------ Фото-вопросы ------------------------------ */

export async function listAdminQuestions(): Promise<AdminPhotoQuestion[]> {
  const data = await adminFetch<{ questions: AdminPhotoQuestion[] }>(
    '/api/photo-questions?admin=1',
  );
  return data.questions;
}

export interface QuestionPayload {
  imagePath: string;
  question: string;
  options: string[];
  correctIndex: number;
  points: number;
  active: boolean;
}

export async function createQuestion(
  payload: QuestionPayload,
): Promise<AdminPhotoQuestion> {
  const data = await adminPost<{ question: AdminPhotoQuestion }>(
    '/api/photo-questions',
    payload,
  );
  return data.question;
}

export async function updateQuestion(
  id: number,
  patch: Partial<QuestionPayload>,
): Promise<AdminPhotoQuestion> {
  const data = await adminFetch<{ question: AdminPhotoQuestion }>(
    '/api/photo-questions',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    },
  );
  return data.question;
}

export function deleteQuestion(id: number): Promise<{ deleted: number }> {
  return adminFetch<{ deleted: number }>(`/api/photo-questions?id=${id}`, {
    method: 'DELETE',
  });
}

export interface UploadResult {
  path: string;
  bytes: number;
  type: string;
}

/** Загрузка картинки. Поле формы — `file`, до 5 МБ, только изображения. */
export function uploadImage(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);
  // Content-Type не ставим вручную: браузер сам добавит boundary.
  return adminFetch<UploadResult>('/api/photo-questions/upload', {
    method: 'POST',
    body: form,
  });
}
