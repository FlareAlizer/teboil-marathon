import crypto from 'node:crypto';
import { nicknameKey, sql } from './db';
import { loginPlayer, type LoginResult } from './queries';

/* ==========================================================================
   Вход через Telegram Mini App.

   Участник сканирует QR, жмёт «Войти через Telegram», и сайт открывается
   внутри Telegram уже с данными аккаунта (`initData`). Ничего вводить не
   нужно — ни юзернейм, ни телефон.

   Данные подписаны Telegram ключом бота, поэтому подделать чужой аккаунт
   нельзя: сервер пересчитывает подпись и без совпадения вход не пускает.
   Алгоритм — из документации Telegram «Validating data received via the
   Mini App».
   ========================================================================== */

export interface TelegramUser {
  id: number;
  username: string | null;
  firstName: string;
}

/** Сколько живут данные входа. Сутки — с запасом на целый день стенда. */
const MAX_AGE_SEC = 24 * 60 * 60;

export function telegramConfig(): { botToken: string; loginUrl: string } | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const loginUrl = process.env.TELEGRAM_MINIAPP_URL?.trim();
  return botToken && loginUrl ? { botToken, loginUrl } : null;
}

function hmacHex(key: Buffer, data: string): string {
  return crypto.createHmac('sha256', key).update(data).digest('hex');
}

function sameHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

/**
 * Проверяет `initData` и возвращает пользователя или null.
 *
 * Строка проверки — все поля, кроме `hash`, по алфавиту, через перевод
 * строки. С 2024 года Telegram добавляет поле `signature` (для проверки без
 * токена); в разных клиентах оно то входит в подпись, то нет, поэтому
 * принимаем оба варианта — оба считаются секретным ключом бота, так что
 * подделать ни один нельзя.
 */
export function verifyInitData(
  initData: string,
  botToken: string,
  now = Date.now(),
): TelegramUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;

  const fields = [...params.entries()].filter(([key]) => key !== 'hash');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const checkString = (list: [string, string][]) =>
    [...list]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

  const variants = [fields, fields.filter(([key]) => key !== 'signature')];
  if (!variants.some((list) => sameHex(hmacHex(secret, checkString(list)), hash))) {
    return null;
  }

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || now / 1000 - authDate > MAX_AGE_SEC) return null;

  try {
    const user = JSON.parse(params.get('user') ?? '') as {
      id?: unknown;
      username?: unknown;
      first_name?: unknown;
    };
    if (typeof user.id !== 'number' || !Number.isSafeInteger(user.id)) return null;
    return {
      id: user.id,
      username: typeof user.username === 'string' ? user.username : null,
      firstName: typeof user.first_name === 'string' ? user.first_name : '',
    };
  } catch {
    return null;
  }
}

/**
 * Ник для участника. Есть юзернейм — он и есть ник, как при ручном входе.
 *
 * Нет юзернейма — «Имя 1234»: имя из Telegram плюс последние цифры id.
 * Не «tg123456789»: экраны показывают похожее на юзернейм имя с «@», и
 * вышел бы чужой, возможно реальный, аккаунт. А по имени волонтёр найдёт
 * человека в поиске.
 */
function nicknameFor(user: TelegramUser, full = false): string {
  if (user.username && /^[A-Za-z0-9_]{3,32}$/.test(user.username)) return user.username;

  const name =
    user.firstName
      .replace(/[^\p{L}\p{N} -]/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 14) || 'Гость';
  const digits = full ? String(user.id) : String(user.id % 10000).padStart(4, '0');
  return `${name} ${digits}`;
}

/**
 * Вход по проверенному аккаунту Telegram.
 *
 * 1. Аккаунт уже входил — тот же участник, даже если сменил юзернейм.
 * 2. Иначе ищем участника с таким ником: человек мог раньше войти на
 *    планшете, вписав свой юзернейм руками, — его баллы должны сохраниться.
 * 3. Если этот ник уже закреплён за ДРУГИМ аккаунтом Telegram (юзернейм
 *    перешёл к новому владельцу), заводим отдельного участника.
 */
export async function loginTelegramPlayer(user: TelegramUser): Promise<LoginResult> {
  const [known] = await sql<{ nickname: string }>(
    'SELECT nickname FROM players WHERE telegram_id = $1',
    [user.id],
  );
  if (known) return loginPlayer(known.nickname);

  let nickname = nicknameFor(user);
  const isUsername = nickname === user.username;
  const [taken] = await sql<{ telegram_id: string | null }>(
    'SELECT telegram_id FROM players WHERE nickname_key = $1',
    [nicknameKey(nickname)],
  );
  // Совпадение юзернейма — надёжный признак того же человека. Совпадение
  // «Имя 1234» с участником, заведённым вручную, — нет: это почти наверняка
  // разные люди, и баллы одного не должны уехать другому.
  const conflict =
    taken !== undefined &&
    (taken.telegram_id !== null ? taken.telegram_id !== String(user.id) : !isUsername);
  if (conflict) nickname = nicknameFor({ ...user, username: null }, true);

  const result = await loginPlayer(nickname);
  await sql('UPDATE players SET telegram_id = $1 WHERE id = $2 AND telegram_id IS NULL', [
    user.id,
    result.player.id,
  ]);
  return result;
}
