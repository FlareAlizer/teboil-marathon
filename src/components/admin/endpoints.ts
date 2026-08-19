'use client';

/**
 * Все обращения админки и лидерборда к API — в одном месте.
 * Если контракт поменяется, правится только этот файл, а не десяток экранов.
 * Формы ответов сверены с обработчиками в src/app/api.
 */

import type {
  Activity,
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

