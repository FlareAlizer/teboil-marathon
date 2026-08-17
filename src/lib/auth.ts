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

function adminPassword(): string {
  return process.env.ADMIN_PASSWORD || 'teboil2026';
}

function sessionSecret(): string {
  return process.env.ADMIN_SESSION_SECRET || 'teboil-stand-2026';
}

/** Токен сессии — HMAC от пароля. Меняется вместе с паролем. */
function expectedToken(): string {
  return createHmac('sha256', sessionSecret()).update(adminPassword()).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Проверяет пароль оператора. */
export function checkPassword(password: unknown): boolean {
  if (typeof password !== 'string' || password.length === 0) return false;
  return safeEqual(password, adminPassword());
}

/** Ставит cookie админ-сессии. Вызывать только из Route Handler. */
export async function createAdminSession(): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_COOKIE, expectedToken(), {
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
  if (!token) return false;
  return safeEqual(token, expectedToken());
}

/** Бросает AuthError (→ 401), если оператор не авторизован. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new AuthError();
}
