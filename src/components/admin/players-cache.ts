'use client';

import type { PlayerSummary } from '@/lib/types';
import { HOUR, loadState, saveState } from '@/lib/persist';
import { searchPlayers } from './endpoints';

/**
 * Список участников на устройстве волонтёра — запасной поиск на случай обрыва.
 *
 * Поиск участника идёт через сервер. Если связь пропала ровно в тот момент,
 * когда человек стоит перед волонтёром, найти его было бы нельзя — и записать
 * результат тоже. Поэтому всех, кого панель уже видела (сегодняшние участники
 * и всё найденное поиском), она помнит и при обрыве ищет среди них.
 *
 * Новых участников, зарегистрировавшихся уже после обрыва, тут не будет —
 * это честное ограничение, а не ошибка.
 */

const KEY = 'teboil.admin.players';
const MAX_AGE = 14 * HOUR;
const LIMIT = 4000;

export function cachedPlayers(): PlayerSummary[] {
  return loadState<PlayerSummary[]>(KEY, MAX_AGE) ?? [];
}

/** Добавляет участников в память устройства; свежие данные заменяют старые. */
export function rememberPlayers(players: readonly PlayerSummary[]): void {
  if (players.length === 0) return;
  const byId = new Map(cachedPlayers().map((p) => [p.id, p]));
  for (const p of players) byId.set(p.id, p);
  saveState(KEY, [...byId.values()].slice(-LIMIT));
}

/** Подтягивает сегодняшних участников. Ошибку глушим: это фоновая подготовка. */
export async function refreshPlayersCache(): Promise<void> {
  try {
    rememberPlayers(await searchPlayers('', 500));
  } catch {
    // Нет связи — останется то, что уже помним.
  }
}
