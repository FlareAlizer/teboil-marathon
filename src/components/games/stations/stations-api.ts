'use client';

/**
 * Данные для экрана станций.
 *
 * Экран показывает прогресс участника: сколько пройдено по каждой активности
 * и сколько за неё набрано. Новых эндпоинтов здесь нет — всё считается из
 * `GET /api/players/[id]`, который отдаёт события игрока, и из
 * `GET /api/leaderboard` для нижнего блока «Лидерборд дня».
 */

import type { ApiResponse, LeaderboardRow, ScoreEvent } from '@/lib/types';

/** Ответ `GET /api/players/[id]`. Форма сверена с обработчиком маршрута. */
export interface PlayerCardData {
  id: number;
  nickname: string;
  createdAt: string;
  eventDay: string;
  totalPoints: number;
  todayPoints: number;
  rank: number | null;
  events: ScoreEvent[];
}

export class StationsApiError extends Error {}

async function request<T>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-store' });
  } catch {
    throw new StationsApiError('Нет связи с сервером стенда');
  }

  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    payload = null;
  }

  if (payload && payload.ok) return payload.data;
  throw new StationsApiError(
    payload && !payload.ok ? payload.error : 'Не удалось загрузить прогресс',
  );
}

/** Карточка участника: профиль, суммы и все его начисления. */
export function getPlayerCard(id: number): Promise<PlayerCardData> {
  return request<PlayerCardData>(`/api/players/${id}`);
}

export interface LeaderboardData {
  day: string;
  updatedAt: string;
  rows: LeaderboardRow[];
}

export function getDayLeaderboard(limit = 4): Promise<LeaderboardData> {
  return request<LeaderboardData>(`/api/leaderboard?limit=${limit}`);
}
