/**
 * Наполняет базу объёмом заведомо больше реального мероприятия, чтобы
 * замерять запросы не на пустой таблице.
 *
 *   node scripts/seed-load-data.mjs [участников] [начислений на каждого]
 *
 * Берёт DATABASE_URL из окружения или .env.
 */

import fs from 'node:fs';
import pg from 'pg';

const PLAYERS = Number(process.argv[2] ?? 5000);
const EVENTS_PER = Number(process.argv[3] ?? 8);

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = fs.readFileSync('.env', 'utf8');
  const line = env.split('\n').find((l) => l.startsWith('DATABASE_URL='));
  if (!line) throw new Error('Не найден DATABASE_URL ни в окружении, ни в .env');
  return line.slice('DATABASE_URL='.length).trim();
}

const client = new pg.Client({ connectionString: databaseUrl() });
await client.connect();

// День — по местному времени, как его считает сайт (todayLocal в db.ts).
// toISOString дал бы дату по UTC, и ночью данные легли бы во вчерашний день.
const now = new Date();
const day = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, '0'),
  String(now.getDate()).padStart(2, '0'),
].join('-');

/** Результат станции, как его записал бы волонтёр: без него запись не попадёт в рейтинг. */
function stationResult(activity, n) {
  if (activity === 'sport_keepups') return { raw: String(n % 60), meta: {} };
  if (activity === 'sport_darts') return { raw: String((n * 7) % 180), meta: {} };
  if (activity === 'sport_obstacle') {
    const time = 15 + (n % 300) / 10;
    return { raw: String(time), meta: { goal: n % 3 !== 0, timeSec: time } };
  }
  return { raw: null, meta: {} };
}
const activities = [
  'quiz_roulette_v1', 'quiz_roulette_v2', 'sport_keepups',
  'sport_obstacle', 'sport_goal', 'sport_darts', 'manual',
];

const started = Date.now();
await client.query('BEGIN');

for (let i = 0; i < PLAYERS; i += 1) {
  const nickname = `load_user_${i}`;
  const { rows } = await client.query(
    `INSERT INTO players (nickname, nickname_key, event_day) VALUES ($1, $2, $3)
     ON CONFLICT (nickname_key) DO UPDATE SET nickname = EXCLUDED.nickname
     RETURNING id`,
    [nickname, nickname, day],
  );
  const id = rows[0].id;

  await client.query(
    `INSERT INTO visits (player_id, event_day) VALUES ($1, $2)
     ON CONFLICT (player_id, event_day) DO NOTHING`,
    [id, day],
  );

  // Вставляем начисления пачкой: по одному запросу на участника это были бы
  // десятки тысяч обращений и минуты ожидания.
  const values = [];
  const params = [];
  for (let e = 0; e < EVENTS_PER; e += 1) {
    const base = e * 6;
    const activity = activities[(i + e) % activities.length];
    const station = stationResult(activity, i * 31 + e);
    values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`);
    params.push(
      id,
      activity,
      5 + ((e * 7) % 40),
      station.raw,
      JSON.stringify({ kind: 'seed', level: (e % 3) + 1, ...station.meta }),
      day,
    );
  }
  await client.query(
    `INSERT INTO score_events (player_id, activity, points, raw_result, meta, event_day)
     VALUES ${values.join(', ')}`,
    params,
  );
}

await client.query('COMMIT');
await client.query('ANALYZE');

const { rows } = await client.query(
  'SELECT (SELECT COUNT(*) FROM players) AS p, (SELECT COUNT(*) FROM score_events) AS e',
);
console.log(`наполнено за ${((Date.now() - started) / 1000).toFixed(1)}с`);
console.log(`участников: ${rows[0].p}, начислений: ${rows[0].e}`);

await client.end();
