import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

/* ==========================================================================
   Авторизация оператора (админка на телефоне).
   Пароль один, лежит в ADMIN_PASSWORD. Сессия — httpOnly cookie с HMAC,
   его нельзя подделать, не зная пароля и секрета.
   ========================================================================== */

export const ADMIN_COOKIE = 'teboil_admin';

/** 12 часов — хватает на смену оператора. */
const SESSION_MAX_AGE = 60 * 60 * 12;

export class AuthError extends Error {
  constructor(message = 'Требуется вход оператора') {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Запасные значения из кода годятся только для запуска на своём компьютере.
 * На боевом сервере их знает любой, кто видел репозиторий, поэтому без
 * ADMIN_PASSWORD в production вход закрыт совсем (см. checkPassword).
 */
const DEV_PASSWORD = 'teboil2026';
const DEV_SECRET = 'teboil-stand-2026';

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** Пароль оператора; null — не настроен на боевом сервере, вход закрыт. */
function adminPassword(): string | null {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  return isProduction() ? null : DEV_PASSWORD;
}

function sessionSecret(): string {
  if (process.env.ADMIN_SESSION_SECRET) return process.env.ADMIN_SESSION_SECRET;
  // Без секрета подпись строится на одном пароле — подделать её всё равно
  // нельзя, не зная пароля, поэтому вход из-за этого не закрываем.
  return isProduction() ? `teboil:${adminPassword() ?? ''}` : DEV_SECRET;
}

/** Настроен ли вход на этом сервере — для журнала при отказе. */
export function adminConfigured(): boolean {
  return adminPassword() !== null;
}

/** Токен сессии — HMAC от пароля. Меняется вместе с паролем. */
function expectedToken(): string | null {
  const password = adminPassword();
  if (password === null) return null;
  return createHmac('sha256', sessionSecret()).update(password).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Проверяет пароль оператора. */
export function checkPassword(password: unknown): boolean {
  const expected = adminPassword();
  if (expected === null) return false;
  if (typeof password !== 'string' || password.length === 0) return false;
  return safeEqual(password, expected);
}

/** Ставит cookie админ-сессии. Вызывать только из Route Handler. */
export async function createAdminSession(): Promise<void> {
  const token = expectedToken();
  if (token === null) throw new AuthError('Вход оператора не настроен на сервере');
  const store = await cookies();
  store.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
    secure: false, // стенд работает по http на localhost / в локальной сети
  });
}

export async function destroyAdminSession(): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
}

/** true, если запрос идёт от залогиненного оператора. */
export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  const expected = expectedToken();
  if (!token || expected === null) return false;
  return safeEqual(token, expected);
}

/** Бросает AuthError (→ 401), если оператор не авторизован. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new AuthError();
}
