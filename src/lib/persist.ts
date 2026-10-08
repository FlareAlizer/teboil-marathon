/**
 * Состояние экрана, пережившее перезагрузку страницы.
 *
 * Телефон гасит экран, браузер выгружает вкладку, сеть моргает и человек
 * жмёт «обновить» — во всех этих случаях страница загружается заново, и без
 * этого файла участник оказывался бы в меню, а волонтёр терял выбранного
 * участника и набранный результат.
 *
 * Хранится в localStorage, а не в sessionStorage: браузер телефона, выгрузив
 * вкладку из памяти, открывает её заново уже с пустым sessionStorage.
 *
 * У каждой записи есть возраст. Вчерашний незаконченный квиз или участник,
 * выбранный на станции позавчера, восстанавливаться не должны — поэтому
 * чтение принимает предел «свежести».
 */

interface Stored<T> {
  at: number;
  value: T;
}

export const HOUR = 60 * 60 * 1000;

export function loadState<T>(key: string, maxAgeMs: number): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Stored<T>;
    if (typeof stored?.at !== 'number' || Date.now() - stored.at > maxAgeMs) {
      window.localStorage.removeItem(key);
      return null;
    }
    return stored.value;
  } catch {
    return null;
  }
}

export function saveState<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify({ at: Date.now(), value } satisfies Stored<T>));
  } catch {
    // Приватный режим или переполненное хранилище: работаем как раньше,
    // просто без восстановления после перезагрузки.
  }
}

export function clearState(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* см. saveState */
  }
}
