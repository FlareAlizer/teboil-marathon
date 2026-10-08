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
import type {
  PlayerRating,
  RatingBoard,
  RatingId,
  StationEntry,
} from '@/lib/rating-defs';
import { adminFetch, adminPost } from './admin-api';

/* --------------------------------- Сессия -------------------------------- */

/**
 * Жив ли вход оператора: 'in' — да, 'out' — нет, 'offline' — сервер не ответил.
 *
 * Третий ответ важен. Раньше обрыв связи считался «входа нет», и панель
 * показывала форму пароля, хотя вход действовал: на площадке с плохим
 * мобильным интернетом это выглядело как «меня выкинуло».
 */
export async function checkSession(): Promise<'in' | 'out' | 'offline'> {
  try {
    const data = await adminFetch<{ authenticated: boolean }>('/api/admin/session');
    return data.authenticated ? 'in' : 'out';
  } catch {
    return 'offline';
  }
}

/* --------------------------------- Игроки -------------------------------- */

/** Пустой запрос возвращает участников сегодняшнего дня. */
/** Пустой запрос и `day` — участники этого дня; баллы дня — за него же. */
export async function searchPlayers(
  q: string,
  limit = 20,
  day?: string,
): Promise<PlayerSummary[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (q) params.set('q', q);
  if (day) params.set('day', day);
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
  /** Место в каждом из четырёх рейтингов дня; null — ещё не выступал. */
  ratings: Record<RatingId, PlayerRating | null>;
  events: ScoreEvent[];
}

/** Карточка участника; баллы дня и места в рейтингах — за `day` (по умолчанию сегодня). */
export function getPlayer(id: number, day?: string): Promise<PlayerCard> {
  const qs = day ? `?day=${day}` : '';
  return adminFetch<PlayerCard>(`/api/players/${id}${qs}`);
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
  /** Метка записи с устройства: по ней сервер не примет одну запись дважды. */
  clientId?: string;
  /** Сколько запись пролежала в очереди на устройстве (для записи без связи). */
  queuedMs?: number;
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

/** Счётчики дня и список всех дней, когда стенд работал. */
export type DayStatsWithDays = DayStats & { days: string[] };

export function getStats(day?: string): Promise<DayStatsWithDays> {
  const qs = day ? `?day=${encodeURIComponent(day)}` : '';
  return adminFetch<DayStatsWithDays>(`/api/stats${qs}`);
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


/* -------------------------------- Рейтинги -------------------------------- */

export interface RatingsData {
  day: string;
  updatedAt: string;
  boards: RatingBoard[];
}

/** Четыре рейтинга дня (или один, если указан `board`) — открыто без входа. */
export function getRatings(limit = 10, board?: RatingId): Promise<RatingsData> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (board) params.set('board', board);
  return adminFetch<RatingsData>(`/api/ratings?${params.toString()}`);
}

export interface StationData {
  board: RatingBoard;
  entries: StationEntry[];
}

/** Рейтинг станции и её последние записи — экран волонтёра. */
export function getStation(board: Exclude<RatingId, 'quiz'>): Promise<StationData> {
  return adminFetch<StationData>(`/api/station?board=${board}`);
}

/** Места участника во всех четырёх рейтингах. */
export function getPlayerRatings(
  id: number,
): Promise<Record<RatingId, PlayerRating | null>> {
  return adminFetch<PlayerCard>(`/api/players/${id}`).then((card) => card.ratings);
}
