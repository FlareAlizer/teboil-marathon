import { Pool, type PoolClient } from 'pg';

/* ==========================================================================
   База стенда: PostgreSQL.

   Схема создаётся при первом обращении и идемпотентна, поэтому сервер можно
   запускать сколько угодно раз и в нескольких процессах сразу.
   ========================================================================== */

/** Дата события в локальном времени сервера: YYYY-MM-DD. */
export function todayLocal(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Ключ уникальности никнейма: регистр и лишние пробелы не должны создавать
 * второго участника. `toLowerCase` в JS корректно работает с кириллицей.
 */
export function nicknameKey(nickname: string): string {
  return nickname.replace(/\s+/g, ' ').trim().toLowerCase();
}

/* --------------------------------- Схема ---------------------------------- */

/**
 * День события хранится отдельной колонкой `event_day`, а не вычисляется из
 * `created_at`. Так индексы обычные, без выражений: все запросы дня —
 * лидерборд, счётчики, суммы участника — попадают в индекс напрямую.
 *
 * Уникальный индекс на ответ квиза — не украшение. Он делает защиту от
 * двойного начисления настоящей: при нескольких рабочих процессах проверка
 * «уже отвечал?» в коде проигрывает гонку, а ограничение в базе — нет.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  id           serial PRIMARY KEY,
  nickname     text NOT NULL,
  nickname_key text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  event_day    date NOT NULL
);

CREATE TABLE IF NOT EXISTS score_events (
  id         bigserial PRIMARY KEY,
  player_id  integer NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  activity   text NOT NULL,
  points     integer NOT NULL DEFAULT 0,
  raw_result text,
  meta       jsonb,
  event_day  date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'auto'
);

CREATE INDEX IF NOT EXISTS idx_events_player_day ON score_events (player_id, event_day);
CREATE INDEX IF NOT EXISTS idx_events_day        ON score_events (event_day);
CREATE INDEX IF NOT EXISTS idx_events_activity   ON score_events (activity, event_day);

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_answer_once
  ON score_events (player_id, activity, (meta->>'questionId'))
  WHERE meta->>'kind' = 'answer';

CREATE TABLE IF NOT EXISTS visits (
  id         bigserial PRIMARY KEY,
  player_id  integer NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  event_day  date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, event_day)
);

CREATE INDEX IF NOT EXISTS idx_players_nickname ON players (lower(nickname) text_pattern_ops);
`;

/* ------------------------------- Подключение ------------------------------- */

const globalForDb = globalThis as unknown as {
  __teboilPool?: Pool;
  __teboilReady?: Promise<void>;
};

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'Не задан DATABASE_URL. Пример: postgres://teboil:пароль@localhost:5432/teboil',
    );
  }

  return new Pool({
    connectionString,
    // Пул на процесс. Больше соединений, чем ядер у базы, дают только лишние
    // переключения контекста — выигрыш приносит число рабочих процессов.
    max: Number(process.env.PGPOOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // Облачная база может требовать TLS.
    ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : undefined,
  });
}

export function getPool(): Pool {
  if (!globalForDb.__teboilPool) {
    globalForDb.__teboilPool = createPool();
  }
  return globalForDb.__teboilPool;
}

/**
 * Создание схемы. Выполняется один раз на процесс: обещание кешируется,
 * поэтому параллельные запросы на старте не побегут создавать таблицы разом.
 */
export function ready(): Promise<void> {
  if (!globalForDb.__teboilReady) {
    globalForDb.__teboilReady = getPool()
      .query(SCHEMA)
      .then(() => undefined)
      .catch((error: unknown) => {
        // Неудачу не кешируем: следующий запрос попробует снова, иначе один
        // сбой сети на старте вывел бы стенд из строя до перезапуска.
        globalForDb.__teboilReady = undefined;
        throw error;
      });
  }
  return globalForDb.__teboilReady;
}

/** Запрос с гарантией, что схема уже создана. */
export async function sql<T extends object = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  await ready();
  const result = await getPool().query(text, params);
  return result.rows as T[];
}

/** Транзакция: там, где несколько записей должны лечь вместе. */
export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  await ready();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
