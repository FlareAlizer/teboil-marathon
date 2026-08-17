'use client';

/**
 * Клиент админ-API.
 *
 * Смена на стенде длится весь день, и сессия оператора может истечь в любой
 * момент. Поэтому 401 обрабатывается централизованно: любой запрос, получивший
 * 401, оповещает подписчиков, а корневой компонент админки показывает форму
 * входа вместо белого экрана. Ни один вызывающий код не обязан помнить про это.
 */

import type { ApiResponse } from '@/lib/types';

/** Сессия истекла или её не было. */
export class AdminUnauthorizedError extends Error {
  constructor() {
    super('Сессия истекла, войдите заново');
    this.name = 'AdminUnauthorizedError';
  }
}

/** Ошибка, которую можно показать оператору как есть. */
export class AdminApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
  }
}

type UnauthorizedListener = () => void;

const listeners = new Set<UnauthorizedListener>();

/** Подписка на потерю сессии. Возвращает функцию отписки. */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyUnauthorized(): void {
  for (const listener of listeners) listener();
}

function messageFor(status: number): string {
  if (status === 404) return 'Не найдено';
  if (status === 413) return 'Файл слишком большой';
  if (status >= 500) return 'Ошибка сервера, попробуйте ещё раз';
  return 'Не удалось выполнить запрос';
}

/**
 * Запрос к админ-API. Возвращает полезные данные из конверта ApiResponse.
 * Бросает AdminUnauthorizedError при 401 и AdminApiError в остальных случаях.
 */
export async function adminFetch<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...init,
    });
  } catch {
    // Стенд может на секунду потерять сеть — это не потеря сессии.
    throw new AdminApiError('Нет связи с сервером', 0);
  }

  if (response.status === 401) {
    notifyUnauthorized();
    throw new AdminUnauthorizedError();
  }

  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    payload = null;
  }

  if (payload && payload.ok) return payload.data;

  const message = payload && !payload.ok ? payload.error : messageFor(response.status);
  throw new AdminApiError(message, response.status);
}

/** JSON-запрос с телом. Заголовок и сериализация — одинаковые во всей админке. */
export function adminPost<T>(url: string, body: unknown): Promise<T> {
  return adminFetch<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Вход оператора. Намеренно НЕ использует adminFetch: там 401 означает
 * «сессия истекла» и переключает всю админку на форму входа, а здесь 401 —
 * это просто неверный пароль, и уходить с формы никуда не нужно.
 */
export async function adminLogin(password: string): Promise<void> {
  let response: Response;

  try {
    response = await fetch('/api/admin/login', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
  } catch {
    throw new AdminApiError('Нет связи с сервером', 0);
  }

  if (response.status === 401) {
    throw new AdminApiError('Неверный пароль', 401);
  }

  let payload: ApiResponse<unknown> | null = null;
  try {
    payload = (await response.json()) as ApiResponse<unknown>;
  } catch {
    payload = null;
  }

  if (payload && payload.ok) return;

  throw new AdminApiError(
    payload && !payload.ok ? payload.error : messageFor(response.status),
    response.status,
  );
}

/** Выход оператора. Ошибку глушим: кнопка выхода не должна ломать экран. */
export async function adminLogout(): Promise<void> {
  try {
    await fetch('/api/admin/logout', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
    });
  } catch {
    // Оффлайн — cookie всё равно перестанет использоваться на этом экране.
  }
}

/** Текст ошибки для показа оператору: любая ошибка сводится к одной строке. */
export function errorText(error: unknown): string {
  if (error instanceof AdminUnauthorizedError) return error.message;
  if (error instanceof AdminApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Неизвестная ошибка';
}
