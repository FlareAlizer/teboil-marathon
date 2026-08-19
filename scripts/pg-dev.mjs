/**
 * Локальный Postgres для разработки и тестов.
 *
 *   node scripts/pg-dev.mjs
 *
 * Поднимает настоящий сервер PostgreSQL в папке .pgdata и держит его, пока не
 * нажмут Ctrl+C. Нужен, чтобы прогонять smoke-test и нагрузочный тест на той
 * же СУБД, что и на бою, а не на эмуляции.
 *
 * Строка подключения печатается при старте — её же кладём в .env.
 */

import EmbeddedPostgres from 'embedded-postgres';

const PORT = Number(process.env.PGDEV_PORT ?? 55432);
const USER = 'teboil';
const PASSWORD = 'teboil';
const DATABASE = 'teboil';

const pg = new EmbeddedPostgres({
  databaseDir: './.pgdata',
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
  onLog: () => {},
});

let initialised = true;
try {
  await pg.initialise();
  initialised = false;
} catch {
  // Папка уже создана прошлым запуском — это нормально, просто стартуем.
}

await pg.start();

if (!initialised) {
  try {
    await pg.createDatabase(DATABASE);
  } catch {
    // База уже есть.
  }
}

const url = `postgres://${USER}:${PASSWORD}@localhost:${PORT}/${DATABASE}`;
console.log('PostgreSQL поднят');
console.log(`DATABASE_URL=${url}`);
console.log('Ctrl+C — остановить');

const stop = async () => {
  await pg.stop().catch(() => undefined);
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

// Держим процесс живым.
await new Promise(() => {});
