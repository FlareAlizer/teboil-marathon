import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

/* ==========================================================================
   Локальная база стенда. Файл: data/teboil.db (SQLite, better-sqlite3).
   Схема создаётся при первом обращении, миграция идемпотентна.
   ========================================================================== */

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'teboil.db');

/** Дата события в локальном времени ноутбука: YYYY-MM-DD. */
export function todayLocal(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Метка времени в локальном времени: YYYY-MM-DD HH:MM:SS.
 *  Все created_at пишем локально, поэтому substr(created_at,1,10) = день события. */
export function nowLocal(date: Date = new Date()): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${todayLocal(date)} ${hh}:${mm}:${ss}`;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname    TEXT NOT NULL UNIQUE COLLATE NOCASE,
  -- Ключ уникальности. COLLATE NOCASE в SQLite сворачивает регистр только у
  -- латиницы, поэтому «Тест» и «ТЕСТ» прошли бы как разные участники, и
  -- человек при повторном входе потерял бы свои баллы. Ключ считает JS.
  nickname_key TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  event_day   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS score_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id   INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  activity    TEXT NOT NULL,
  points      INTEGER NOT NULL DEFAULT 0,
  raw_result  TEXT,
  meta        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  created_by  TEXT NOT NULL DEFAULT 'auto'
);

CREATE INDEX IF NOT EXISTS idx_score_events_player  ON score_events(player_id);
CREATE INDEX IF NOT EXISTS idx_score_events_day     ON score_events(substr(created_at,1,10));
CREATE INDEX IF NOT EXISTS idx_score_events_activity ON score_events(activity);

CREATE TABLE IF NOT EXISTS photo_questions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  image_path    TEXT NOT NULL,
  question      TEXT NOT NULL,
  options       TEXT NOT NULL,
  correct_index INTEGER NOT NULL,
  points        INTEGER NOT NULL DEFAULT 25,
  active        INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS visits (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  event_day  TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_visits_unique ON visits(player_id, event_day);
`;

type DB = Database.Database;

// В dev-режиме Next перезагружает модули — держим одно соединение на процесс.
const globalForDb = globalThis as unknown as { __teboilDb?: DB };

function createConnection(): DB {
  fs.mkdirSync(DB_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);
  migrateNicknameKey(db);
  seedPhotoQuestions(db);
  return db;
}

/**
 * Ключ уникальности никнейма: регистр и лишние пробелы не должны создавать
 * второго участника. `toLowerCase` в JS корректно работает с кириллицей,
 * в отличие от SQLite COLLATE NOCASE.
 */
export function nicknameKey(nickname: string): string {
  return nickname.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Досоздаёт колонку ключа в базах, заведённых прежней схемой, и заполняет её.
 * База живёт между днями мероприятия, поэтому пересоздать её нельзя.
 */
function migrateNicknameKey(db: DB): void {
  const columns = db.prepare('PRAGMA table_info(players)').all() as Array<{
    name: string;
  }>;
  if (!columns.some((c) => c.name === 'nickname_key')) {
    db.exec('ALTER TABLE players ADD COLUMN nickname_key TEXT');
  }

  const rows = db
    .prepare('SELECT id, nickname FROM players WHERE nickname_key IS NULL')
    .all() as Array<{ id: number; nickname: string }>;

  if (rows.length > 0) {
    const update = db.prepare('UPDATE players SET nickname_key = ? WHERE id = ?');
    const fill = db.transaction((list: typeof rows) => {
      for (const row of list) update.run(nicknameKey(row.nickname), row.id);
    });
    fill(rows);
  }

  // Уникальный индекс создаём после заполнения: иначе он упал бы на NULL-дублях.
  try {
    db.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_players_nickname_key ON players(nickname_key)',
    );
  } catch {
    // В базе уже есть дубли, разошедшиеся по регистру (данные прошлого запуска).
    // Не роняем стенд: вход продолжит работать по ключу, к первому совпадению.
  }
}

export function getDb(): DB {
  if (!globalForDb.__teboilDb) {
    globalForDb.__teboilDb = createConnection();
  }
  return globalForDb.__teboilDb;
}

/* --------------------------------------------------------------------------
   Первичное наполнение фото-вопросов из src/data/photo-questions.json.
   Файл готовит контент-агент; читаем через fs, чтобы сборка не падала,
   если файла ещё нет. Наполняем только пустую таблицу.
   -------------------------------------------------------------------------- */

interface SeedPhotoQuestion {
  imagePath: string;
  question: string;
  options: string[];
  correctIndex: number;
  points?: number;
  active?: boolean;
}

function seedPhotoQuestions(db: DB): void {
  try {
    const row = db.prepare('SELECT COUNT(*) AS c FROM photo_questions').get() as {
      c: number;
    };
    if (row.c > 0) return;

    const file = path.join(process.cwd(), 'src', 'data', 'photo-questions.json');
    if (!fs.existsSync(file)) return;

    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    const items: SeedPhotoQuestion[] = Array.isArray(parsed)
      ? (parsed as SeedPhotoQuestion[])
      : ((parsed as { questions?: SeedPhotoQuestion[] }).questions ?? []);

    const insert = db.prepare(
      `INSERT INTO photo_questions (image_path, question, options, correct_index, points, active)
       VALUES (@imagePath, @question, @options, @correctIndex, @points, @active)`,
    );
    const insertMany = db.transaction((list: SeedPhotoQuestion[]) => {
      for (const q of list) {
        if (!q?.imagePath || !q?.question || !Array.isArray(q.options)) continue;
        if (q.options.length !== 4) continue;
        if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3) {
          continue;
        }
        insert.run({
          imagePath: q.imagePath,
          question: q.question,
          options: JSON.stringify(q.options),
          correctIndex: q.correctIndex,
          points: Number.isInteger(q.points) ? q.points : 25,
          active: q.active === false ? 0 : 1,
        });
      }
    });
    insertMany(items);
  } catch {
    // Плохой JSON не должен ронять сервер стенда — просто не наполняем таблицу.
  }
}
