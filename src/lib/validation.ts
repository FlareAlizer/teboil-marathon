import { ACTIVITIES, type Activity, type CreatedBy } from './types';

/** Ошибка валидации на границе системы — превращается в 400. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function fail(message: string): never {
  throw new ValidationError(message);
}

/* -------------------------------------------------------------------------- */

const NICKNAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} -]*$/u;

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 20;

/**
 * Никнейм участника: 2–20 символов, буквы/цифры/пробел/дефис.
 * Возвращает нормализованный вид (схлопнутые пробелы, обрезанные края).
 */
export function normalizeNickname(input: unknown): string {
  if (typeof input !== 'string') fail('Никнейм обязателен');
  const value = input.replace(/\s+/g, ' ').trim();
  if (value.length < NICKNAME_MIN) {
    fail(`Никнейм должен быть не короче ${NICKNAME_MIN} символов`);
  }
  if (value.length > NICKNAME_MAX) {
    fail(`Никнейм должен быть не длиннее ${NICKNAME_MAX} символов`);
  }
  if (!NICKNAME_RE.test(value)) {
    fail('Никнейм может содержать только буквы, цифры, пробел и дефис');
  }
  return value;
}

export function isValidNickname(input: unknown): boolean {
  try {
    normalizeNickname(input);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------- Телеграм-юзернейм ------------------------------ */

/** Правила Телеграма: латиница, цифры и `_`, 5–32 символа, начинается с буквы. */
const TELEGRAM_RE = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;

export const TELEGRAM_HINT =
  'Юзернейм — латиница, цифры и _, от 5 до 32 символов. Например: @running_fox';

/**
 * Юзернейм участника из Телеграма — основной способ входа на киоске.
 *
 * Ведущая «собака» и пробелы отбрасываются: человек диктует или списывает
 * с экрана телефона по-разному, но в базе это должен быть один и тот же
 * участник. Регистр сохраняем для показа, а сравнение идёт по ключу
 * (см. nicknameKey в db.ts) — в Телеграме регистр не важен.
 */
export function normalizeTelegramUsername(input: unknown): string {
  if (typeof input !== 'string') fail('Укажите юзернейм в Телеграме');

  // Срезаем только края и «собаку». Пробелы ВНУТРИ не удаляем: иначе
  // «fast fox» молча превратился бы в @fastfox — возможно, чужой аккаунт,
  // и человек копил бы баллы не себе.
  const value = input.trim().replace(/^@+/, '').trim();

  if (value === '') fail('Укажите юзернейм в Телеграме');
  if (!TELEGRAM_RE.test(value)) fail(TELEGRAM_HINT);

  return value;
}

/** Похоже ли имя на телеграм-юзернейм — от этого зависит показ «@» на экранах. */
export function looksLikeTelegram(nickname: string): boolean {
  return TELEGRAM_RE.test(nickname);
}

/** Как показывать участника: @username для Телеграма, как есть — для остальных. */
export function displayName(nickname: string): string {
  return looksLikeTelegram(nickname) ? `@${nickname}` : nickname;
}

/* -------------------------------------------------------------------------- */

export function parseActivity(input: unknown): Activity {
  if (typeof input !== 'string' || !ACTIVITIES.includes(input as Activity)) {
    fail('Неизвестная активность');
  }
  return input as Activity;
}

export function parseCreatedBy(input: unknown): CreatedBy {
  if (input === undefined || input === null) return 'auto';
  if (input !== 'auto' && input !== 'admin') fail('createdBy: ожидается auto или admin');
  return input;
}

export function parseId(input: unknown, field = 'id'): number {
  const n = typeof input === 'string' ? Number(input) : input;
  if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) {
    fail(`Некорректный ${field}`);
  }
  return n;
}

export function parseInt_(
  input: unknown,
  field: string,
  min: number,
  max: number,
): number {
  const n = typeof input === 'string' ? Number(input) : input;
  if (typeof n !== 'number' || !Number.isInteger(n)) fail(`Некорректное поле ${field}`);
  if (n < min || n > max) fail(`Поле ${field} должно быть от ${min} до ${max}`);
  return n;
}

export function parseText(
  input: unknown,
  field: string,
  { min = 1, max = 500 }: { min?: number; max?: number } = {},
): string {
  if (typeof input !== 'string') fail(`Поле ${field} обязательно`);
  const value = input.trim();
  if (value.length < min) fail(`Поле ${field} обязательно`);
  if (value.length > max) fail(`Поле ${field} длиннее ${max} символов`);
  return value;
}

export function parseOptionalText(
  input: unknown,
  field: string,
  max = 500,
): string | null {
  if (input === undefined || input === null || input === '') return null;
  if (typeof input !== 'string') fail(`Поле ${field} должно быть строкой`);
  const value = input.trim();
  if (value.length > max) fail(`Поле ${field} длиннее ${max} символов`);
  return value.length ? value : null;
}

export function parseBool(input: unknown, fallback = false): boolean {
  if (input === undefined || input === null) return fallback;
  if (typeof input === 'boolean') return input;
  if (input === 1 || input === '1' || input === 'true') return true;
  if (input === 0 || input === '0' || input === 'false') return false;
  return fallback;
}

/** Ровно 4 непустых варианта ответа. */
export function parseOptions(input: unknown): string[] {
  if (!Array.isArray(input) || input.length !== 4) {
    fail('Нужно ровно 4 варианта ответа');
  }
  return input.map((o, i) => parseText(o, `вариант ${i + 1}`, { max: 200 }));
}

export function parseMeta(input: unknown): Record<string, unknown> | null {
  if (input === undefined || input === null) return null;
  if (typeof input !== 'object' || Array.isArray(input)) {
    fail('Поле meta должно быть объектом');
  }
  const json = JSON.stringify(input);
  if (json.length > 4000) fail('Поле meta слишком большое');
  return input as Record<string, unknown>;
}

/** Безопасный разбор тела запроса. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      fail('Ожидается JSON-объект');
    }
    return body as Record<string, unknown>;
  } catch (e) {
    if (e instanceof ValidationError) throw e;
    fail('Некорректный JSON в теле запроса');
  }
}
