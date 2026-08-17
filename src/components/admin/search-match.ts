/**
 * Прощающее сопоставление никнеймов.
 *
 * Участник называет свой кодовый никнейм голосом, в шуме, а оператор набирает
 * на слух. Поэтому поиск обязан игнорировать регистр, «ё», пробелы и дефисы,
 * а также путаницу похожих букв кириллицы и латиницы (раскладка/автозамена).
 *
 * Серверный поиск остаётся источником данных; эти функции только
 * переупорядочивают выдачу так, чтобы самый вероятный игрок был первым.
 */

/** Латинские буквы, визуально совпадающие с кириллическими. */
const HOMOGLYPHS: Record<string, string> = {
  a: 'а',
  b: 'в',
  c: 'с',
  e: 'е',
  h: 'н',
  k: 'к',
  m: 'м',
  o: 'о',
  p: 'р',
  t: 'т',
  x: 'х',
  y: 'у',
};

/**
 * Приводит никнейм к форме, в которой его можно сравнивать:
 * нижний регистр, ё → е, латиница-двойник → кириллица, без пробелов и дефисов.
 */
export function normalizeNickname(value: string): string {
  const lowered = value.toLowerCase().replace(/ё/g, 'е');

  let out = '';
  for (const ch of lowered) {
    if (ch === ' ' || ch === '-' || ch === '_' || ch === '.') continue;
    out += HOMOGLYPHS[ch] ?? ch;
  }
  return out;
}

/** Есть ли буквы запроса в никнейме в том же порядке (набрали с пропуском). */
function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (const ch of haystack) {
    if (ch === needle[i]) i += 1;
    if (i === needle.length) return true;
  }
  return needle.length === 0;
}

/**
 * Оценка совпадения: больше — лучше, 0 — не совпало вовсе.
 * Точное совпадение → начало никнейма → любая часть → буквы по порядку.
 */
export function matchScore(nickname: string, query: string): number {
  const n = normalizeNickname(nickname);
  const q = normalizeNickname(query);
  if (q === '') return 0;

  if (n === q) return 1000;
  if (n.startsWith(q)) return 800 - (n.length - q.length);
  const at = n.indexOf(q);
  if (at >= 0) return 600 - at * 4 - (n.length - q.length);
  if (isSubsequence(q, n)) return 300 - (n.length - q.length);
  return 0;
}

/**
 * Переупорядочивает найденных игроков по «похожести» на то, что набрал
 * оператор. Порядок внутри одинаковых оценок сохраняется — стабильная
 * сортировка не даёт списку прыгать при каждом нажатии клавиши.
 */
export function rankByNickname<T extends { nickname: string }>(
  items: readonly T[],
  query: string,
): T[] {
  if (query.trim() === '') return [...items];

  return items
    .map((item, index) => ({ item, index, score: matchScore(item.nickname, query) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}
