'use client';

/**
 * Данные для экрана станций.
 *
 * Экран показывает, где участник стоит в каждом из четырёх рейтингов дня, и
 * верх рейтинга квиза. Всё берётся из `GET /api/players/[id]` (там места
 * участника) и `GET /api/ratings`.
 */

import type { ApiResponse, ScoreEvent } from '@/lib/types';
import type { PlayerRating, RatingBoard, RatingId } from '@/lib/rating-defs';

/** Ответ `GET /api/players/[id]`. Форма сверена с обработчиком маршрута. */
export interface PlayerCardData {
  id: number;
  nickname: string;
  createdAt: string;
  eventDay: string;
  totalPoints: number;
  todayPoints: number;
  rank: number | null;
  ratings: Record<RatingId, PlayerRating | null>;
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

/** Карточка участника: профиль, суммы, места в рейтингах и начисления. */
export function getPlayerCard(id: number): Promise<PlayerCardData> {
  return request<PlayerCardData>(`/api/players/${id}`);
}

/** Верх одного рейтинга дня. */
export async function getRatingTop(board: RatingId, limit = 4): Promise<RatingBoard> {
  const data = await request<{ boards: RatingBoard[] }>(
    `/api/ratings?board=${board}&limit=${limit}`,
  );
  return data.boards[0];
}
