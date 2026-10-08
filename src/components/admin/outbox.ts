'use client';

import { useEffect, useState } from 'react';
import type { SportActivity } from '@/lib/types';
import { AdminApiError, AdminUnauthorizedError } from './admin-api';
import { addScore } from './endpoints';

/**
 * Очередь результатов станций, которые не удалось отправить.
 *
 * Сеть на площадке пропадает, а очередь к волонтёру — нет. Раньше при обрыве
 * результат просто не записывался, и человека приходилось либо держать, либо
 * отпускать без записи. Теперь запись сохраняется на устройстве, волонтёр
 * берёт следующего участника, а запись уходит на сервер сама, как только
 * появится связь — даже если страницу за это время перезагрузили.
 *
 * Дважды записаться результат не может: у каждой записи своя метка
 * (`clientId`), и сервер принимает метку один раз.
 */

export interface PendingEntry {
  clientId: string;
  playerId: number;
  nickname: string;
  activity: SportActivity;
  points: number;
  rawResult: string;
  meta: Record<string, unknown> | null;
  /** Как показать запись волонтёру: «34 касания». */
  label: string;
  at: number;
  /** Сервер ответил отказом — запись сама не уйдёт, нужен человек. */
  error?: string;
}

const KEY = 'teboil.admin.outbox';
const listeners = new Set<() => void>();

function read(): PendingEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as PendingEntry[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list: PendingEntry[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Хранилище недоступно — очередь проживёт до перезагрузки страницы в памяти.
  }
  for (const listener of listeners) listener();
}

/** Метка записи. Случайная и длинная: совпасть у двух записей она не может. */
export function newClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function enqueue(entry: PendingEntry): void {
  write([...read(), entry]);
}

export function dismiss(clientId: string): void {
  write(read().filter((e) => e.clientId !== clientId));
}

let flushing = false;

/**
 * Пробует отправить всё, что накопилось. Нет связи или истёк вход — молча
 * останавливается до следующей попытки, записи остаются в очереди. Отказ
 * сервера по существу (участник удалён, результат не прошёл проверку) —
 * запись остаётся с пометкой, её увидит волонтёр.
 */
export async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    for (const entry of read()) {
      if (entry.error) continue;
      try {
        await addScore({
          playerId: entry.playerId,
          activity: entry.activity,
          points: entry.points,
          rawResult: entry.rawResult,
          meta: entry.meta,
          clientId: entry.clientId,
        });
        dismiss(entry.clientId);
      } catch (e) {
        if (e instanceof AdminUnauthorizedError) return;
        if (e instanceof AdminApiError && e.status !== 0) {
          write(read().map((x) => (x.clientId === entry.clientId ? { ...x, error: e.message } : x)));
          continue;
        }
        return; // связи всё ещё нет — попробуем позже
      }
    }
  } finally {
    flushing = false;
  }
}

/** Очередь для экрана + фоновая досылка каждые несколько секунд. */
export function useOutbox(): PendingEntry[] {
  const [items, setItems] = useState<PendingEntry[]>([]);

  useEffect(() => {
    const sync = () => setItems(read());
    sync();
    listeners.add(sync);

    void flush();
    const timer = setInterval(() => void flush(), 5000);
    const onOnline = () => void flush();
    window.addEventListener('online', onOnline);

    return () => {
      listeners.delete(sync);
      clearInterval(timer);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  return items;
}
