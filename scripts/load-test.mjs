/**
 * Нагрузочный тест стенда.
 *
 *   node scripts/load-test.mjs [http://localhost:3000] [пароль_админа]
 *
 * Моделирует реальный сценарий мероприятия, а не абстрактные запросы:
 * участник входит, берёт квиз, отвечает на три вопроса, смотрит станции;
 * параллельно телевизор опрашивает лидерборд, а оператор начисляет баллы.
 *
 * Меряем то, что определяет ощущение на площадке: медиану и 95-й перцентиль
 * отклика (по нему видно, как долго ждёт самый невезучий из очереди) и долю
 * ошибок. Средним не пользуемся — оно прячет выбросы.
 */

const BASE = process.argv[2] ?? 'http://localhost:3000';
const ADMIN_PASSWORD = process.argv[3] ?? 'teboil2026';

const LEVELS = [10, 25, 50, 100, 200];

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}

class Stats {
  constructor() {
    this.samples = [];
    this.errors = 0;
  }
  add(ms) {
    this.samples.push(ms);
  }
  fail() {
    this.errors += 1;
  }
  summary() {
    const s = [...this.samples].sort((a, b) => a - b);
    return {
      count: s.length,
      errors: this.errors,
      p50: Math.round(percentile(s, 50)),
      p95: Math.round(percentile(s, 95)),
      max: Math.round(s[s.length - 1] ?? 0),
    };
  }
}

async function timed(stats, fn) {
  const t = performance.now();
  try {
    const result = await fn();
    stats.add(performance.now() - t);
    return result;
  } catch {
    stats.add(performance.now() - t);
    stats.fail();
    return null;
  }
}

async function call(path, init) {
  const response = await fetch(`${BASE}${path}`, { cache: 'no-store', ...init });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.ok === false) throw new Error(`HTTP ${response.status}`);
  return body?.data;
}

const post = (path, data, headers = {}) =>
  call(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
  });

/** Один участник: вход → квиз → три ответа → станции. */
async function participant(id, run, stats) {
  const nickname = `load_${run}_${id}_${Math.floor(Math.random() * 1e6)}`;

  const player = await timed(stats.login, () => post('/api/players', { nickname }));
  if (!player) return;

  const quiz = await timed(stats.quiz, () => call('/api/quiz?variant=v1'));
  if (!quiz) return;

  // По одному вопросу на каждый из трёх уровней — как в реальной попытке.
  for (const level of quiz.levels) {
    const q = level.questions[Math.floor(Math.random() * level.questions.length)];
    await timed(stats.answer, () =>
      post('/api/quiz/answer', {
        playerId: player.id,
        variant: 'v1',
        questionId: q.id,
        answerIndex: Math.floor(Math.random() * 4),
        bet: false,
      }),
    );
  }

  await timed(stats.stations, () => call(`/api/players/${player.id}`));
  return player.id;
}

/** Телевизор: опрос лидерборда, пока идёт волна участников. */
async function screenPolling(stats, stop) {
  while (!stop.done) {
    await timed(stats.board, () => call('/api/leaderboard?limit=10'));
    await new Promise((r) => setTimeout(r, 300));
  }
}

/** Оператор: начисления за спортивные станции во время волны. */
async function operator(stats, cookie, players, stop) {
  const activities = ['sport_keepups', 'sport_obstacle', 'sport_goal', 'sport_darts'];
  while (!stop.done) {
    const id = players[Math.floor(Math.random() * players.length)];
    if (id) {
      await timed(stats.award, () =>
        post(
          '/api/score',
          {
            playerId: id,
            activity: activities[Math.floor(Math.random() * activities.length)],
            points: 10 + Math.floor(Math.random() * 30),
            createdBy: 'admin',
          },
          { cookie },
        ),
      );
    }
    await new Promise((r) => setTimeout(r, 150));
  }
}

async function runLevel(concurrency, cookie) {
  const stats = {
    login: new Stats(),
    quiz: new Stats(),
    answer: new Stats(),
    stations: new Stats(),
    board: new Stats(),
    award: new Stats(),
  };
  const stop = { done: false };
  const players = [];

  const started = performance.now();
  const background = [screenPolling(stats, stop), operator(stats, cookie, players, stop)];

  const wave = Array.from({ length: concurrency }, (_, i) =>
    participant(i, concurrency, stats).then((id) => {
      if (id) players.push(id);
    }),
  );
  await Promise.all(wave);

  stop.done = true;
  await Promise.all(background);
  const seconds = (performance.now() - started) / 1000;

  const requests =
    Object.values(stats).reduce((sum, s) => sum + s.samples.length, 0);
  const errors = Object.values(stats).reduce((sum, s) => sum + s.errors, 0);

  return { stats, seconds, requests, errors };
}

/* ---------------------------------- Запуск --------------------------------- */

console.log(`Нагрузочный тест: ${BASE}\n`);

const login = await fetch(`${BASE}/api/admin/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: ADMIN_PASSWORD }),
});
const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
if (!cookie) {
  console.log('Не удалось войти оператором — начисления в тест не войдут.\n');
}

const rows = [];
for (const level of LEVELS) {
  process.stdout.write(`${String(level).padStart(3)} участников одновременно… `);
  const { stats, seconds, requests, errors } = await runLevel(level, cookie);
  const rps = Math.round(requests / seconds);
  console.log(`${seconds.toFixed(1)}с, ${requests} запросов, ${rps} rps, ошибок ${errors}`);
  rows.push({ level, seconds, rps, errors, stats });
}

console.log('\nОТКЛИК ПО ОПЕРАЦИЯМ (мс: медиана / 95-й перцентиль / максимум)\n');
const labels = {
  login: 'вход участника',
  quiz: 'загрузка квиза',
  answer: 'ответ на вопрос',
  stations: 'экран станций',
  board: 'лидерборд',
  award: 'начисление оператором',
};
console.log('операция'.padEnd(24) + LEVELS.map((l) => String(l).padStart(16)).join(''));
for (const key of Object.keys(labels)) {
  const cells = rows.map((r) => {
    const s = r.stats[key].summary();
    return `${s.p50}/${s.p95}/${s.max}`.padStart(16);
  });
  console.log(labels[key].padEnd(24) + cells.join(''));
}

console.log('\nИТОГ');
for (const r of rows) {
  const slow = Object.values(r.stats).some((s) => s.summary().p95 > 1000);
  console.log(
    `  ${String(r.level).padStart(3)} участников: ${r.rps} rps, ошибок ${r.errors}` +
      (slow ? '  ← 95-й перцентиль выше секунды' : ''),
  );
}
