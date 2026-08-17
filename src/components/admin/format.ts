/** Форматирование чисел и времени для админки и лидерборда. Без зависимостей. */

/** Русское склонение: 1 балл, 2 балла, 5 баллов. */
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.trunc(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;

  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

/** «12 баллов» */
export function pointsLabel(n: number): string {
  return `${n} ${pluralRu(n, 'балл', 'балла', 'баллов')}`;
}

/** «7 участников» */
export function playersLabel(n: number): string {
  return `${n} ${pluralRu(n, 'участник', 'участника', 'участников')}`;
}

/** Со знаком: «+45». Для подтверждения начисления и отмены. */
export function signedPoints(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/**
 * Разбор времени с сервера. Если в строке нет часового пояса (SQLite отдаёт
 * «2026-08-11 14:03:22»), считаем её локальным временем стенда, иначе на
 * телефоне оператора время начислений уедет на несколько часов.
 */
export function parseServerDate(value: string): Date | null {
  if (!value) return null;

  // «2026-08-11 14:03:22» → «2026-08-11T14:03:22»: форма без часового пояса
  // трактуется движком как локальное время, чего мы и добиваемся.
  const iso = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(iso);

  return Number.isNaN(date.getTime()) ? null : date;
}

/** «14:03» — время начисления в списках и истории. */
export function formatTime(value: string): string {
  const date = parseServerDate(value);
  if (!date) return '—';

  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** «11.08, 14:03» — когда нужен ещё и день. */
export function formatDayTime(value: string): string {
  const date = parseServerDate(value);
  if (!date) return '—';

  const dd = String(date.getDate()).padStart(2, '0');
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mo}, ${formatTime(value)}`;
}

/**
 * Обрезает слишком длинный никнейм. На лидерборде строки имеют фиксированную
 * высоту, поэтому переносы недопустимы — только многоточие.
 */
export function truncateNickname(nickname: string, max = 18): string {
  return nickname.length > max ? `${nickname.slice(0, max - 1)}…` : nickname;
}
