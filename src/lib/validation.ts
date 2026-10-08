import { ACTIVITIES, type Activity, type CreatedBy } from './types';
import { SCORING, obstacleFinalTime } from './scoring';

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

/* ------------------------------ Ник участника ----------------------------- */

/** Буквы любого алфавита, цифры, пробел, дефис, точка и `_` (как в юзернейме Телеграма). */
const NICKNAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u;

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 32;

/**
 * Ник участника — в том виде, в каком его ввёл сам человек: «Петя Солдат»
 * или юзернейм из Телеграма. Один формат и на экране входа, и в панели
 * волонтёра: любое отличие означало бы, что одного и того же человека где-то
 * не пустят.
 *
 * Края, «собака» и ссылка на профиль (t.me/name — её копируют прямо из
 * Телеграма) отбрасываются, лишние пробелы схлопываются: так «@Fox» и «fox»
 * остаются одним участником. Регистр сохраняем для показа, сравнение идёт по
 * ключу без регистра (nicknameKey в db.ts).
 */
export function normalizeNickname(input: unknown): string {
  if (typeof input !== 'string') fail('Впиши ник');
  const value = input
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?(t|telegram)\.me\//i, '')
    .replace(/^@+/, '')
    .replace(/\/+$/, '')
    .trim();

  if (value === '') fail('Впиши ник');
  if (value.length < NICKNAME_MIN) fail(`Ник — хотя бы ${NICKNAME_MIN} символа`);
  if (value.length > NICKNAME_MAX) fail(`Ник — не длиннее ${NICKNAME_MAX} символов`);
  if (!NICKNAME_RE.test(value)) {
    fail('В нике можно буквы, цифры, пробел, дефис, точку и _ — без смайликов и значков');
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

/* --------------------------------- Показ ---------------------------------- */

/** Правила юзернейма Телеграма: латиница, цифры и `_`, 5–32 символа. */
const TELEGRAM_RE = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;

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

/* ------------------------- Результаты на станциях ------------------------- */

const MAX_SPORT_RESULT = 999;

/**
 * Проверка результата станции на сервере. Рейтинги чеканки, дартса и полосы
 * сортируются по этому числу, поэтому принимать что угодно нельзя: одна
 * опечатка вида «3з» выпала бы из таблицы, а «9999» навсегда заняла бы
 * первое место.
 *
 * Для полосы итоговое время считает сервер — из чистого времени и того,
 * забит ли мяч. Клиенту итог не доверяем: штраф за промах должен быть
 * одинаковым на любом телефоне волонтёра.
 */
export function parseSportEntry(
  activity: Activity,
  rawResult: string | null,
  meta: Record<string, unknown> | null,
): { rawResult: string | null; meta: Record<string, unknown> | null } {
  if (activity === 'sport_keepups' || activity === 'sport_darts') {
    if (rawResult === null || !/^\d{1,3}$/.test(rawResult)) {
      fail(`Результат: целое число от 0 до ${MAX_SPORT_RESULT}`);
    }
    return { rawResult: String(Number(rawResult)), meta };
  }

  if (activity === 'sport_obstacle') {
    const cleaned = (rawResult ?? '').replace(',', '.');
    const time = Number(cleaned);
    if (!/^\d{1,3}([.]\d)?$/.test(cleaned) || time <= 0) {
      fail('Время: число секунд больше нуля, не больше одной цифры после запятой');
    }
    const goal = meta?.goal;
    if (typeof goal !== 'boolean') fail('Полоса: укажите, забит ли мяч');
    const penaltySec = goal ? 0 : SCORING.sport.sport_obstacle.missPenaltySec;
    return {
      rawResult: String(obstacleFinalTime(time, goal)),
      meta: { ...meta, timeSec: time, goal, penaltySec },
    };
  }

  return { rawResult, meta };
}
