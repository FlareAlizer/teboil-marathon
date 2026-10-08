'use client';

import { trace } from './client-trace';

/**
 * Восстановление после «устаревшей страницы».
 *
 * Сценарий: вышла новая версия сайта, а на медленной сети сервис-воркер
 * отдал сохранённую старую страницу. Она просит скрипт старой версии,
 * которого уже нет ни в памяти телефона, ни на сервере, — и экран падает
 * с ChunkLoadError, а перезагрузка повторяет то же самое.
 *
 * Здесь такая ошибка распознаётся и страница один раз перезагружается с
 * пометкой `__fresh`: сервис-воркер такую загрузку не подменяет, и
 * приходит свежая версия. Не чаще раза в 30 секунд — без зацикливания.
 */
const STALE = /ChunkLoadError|Loading (CSS )?chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;
const KEY = 'teboil.freshReloadAt';

export function isStaleChunkError(message: unknown): boolean {
  return STALE.test(String(message ?? ''));
}

/** true — перезагрузка запущена, показывать экран ошибки не нужно. */
export function reloadFresh(reason: string): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 30_000) return false;
    window.sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Без хранилища не можем защититься от цикла — не перезагружаем.
    return false;
  }
  trace('fresh_reload', { reason: reason.slice(0, 120) });
  const url = new URL(window.location.href);
  url.searchParams.set('__fresh', String(Date.now()));
  window.location.replace(url.toString());
  return true;
}

/** Убирает служебную пометку из адресной строки после свежей загрузки. */
export function cleanFreshMark(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('__fresh')) return;
    url.searchParams.delete('__fresh');
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    /* не важно */
  }
}
