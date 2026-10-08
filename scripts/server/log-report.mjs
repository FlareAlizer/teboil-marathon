/**
 * Отчёт по журналам за день: что случилось, где люди спотыкались, когда
 * было плохо. Читает то, что собрал collect-logs.sh:
 *
 *   node scripts/server/log-report.mjs <папка>
 *
 * В папке: app.jsonl (события приложения и отметки устройств), nginx.log
 * (каждый запрос со временем ответа), monitor.log (состояние сервера раз в
 * 30 секунд). Любого файла может не быть — отчёт построится по остальным.
 */
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] ?? '.';
const read = (name) => {
  try {
    return fs.readFileSync(path.join(dir, name), 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
};

const out = [];
const say = (line = '') => out.push(line);
const head = (title) => {
  say('');
  say(`=== ${title} ${'='.repeat(Math.max(0, 70 - title.length))}`);
};
const inc = (map, key, by = 1) => map.set(key, (map.get(key) ?? 0) + by);
const top = (map, n = 15) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);
const minute = (iso) => (iso ?? '').slice(11, 16);

/* ------------------------------ События приложения ------------------------------ */

const events = [];
let notJson = 0;
for (const line of read('app.jsonl')) {
  try {
    const e = JSON.parse(line);
    if (e && e.ev) events.push(e);
  } catch {
    notJson += 1;
  }
}
const server = events.filter((e) => e.ev !== 'client');
const client = events.filter((e) => e.ev === 'client');
// Время событий в журнале — UTC (ISO). Для людей переводим в МСК.
const msk = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '?' : new Date(d.getTime() + 3 * 3600_000).toISOString().slice(11, 19);
};

head('КОРОТКО');
const devices = new Set(client.map((e) => e.dev).filter(Boolean));
const players = new Set(server.filter((e) => e.ev === 'player_login').map((e) => e.player));
const answers = server.filter((e) => e.ev === 'quiz_answer' && !e.repeat).length;
const errors500 = server.filter((e) => e.ev === 'api_error');
say(`устройств (по отметкам): ${devices.size}`);
say(`входов участников: ${server.filter((e) => e.ev === 'player_login').length}, разных участников: ${players.size}, новых: ${server.filter((e) => e.ev === 'player_login' && e.created).length}`);
say(`ответов в квизе: ${answers}, повторов (ответ уже был): ${server.filter((e) => e.ev === 'quiz_answer' && e.repeat).length}`);
say(`бонусов за все уровни: ${server.filter((e) => e.ev === 'quiz_bonus' && e.awarded).length}`);
say(`записей станций: ${server.filter((e) => e.ev === 'score_add' && !e.dup).length}, из них пришли из очереди без связи: ${server.filter((e) => e.ev === 'score_add' && e.queuedS).length}, повторов отброшено: ${server.filter((e) => e.ev === 'score_add' && e.dup).length}`);
say(`отмен записей: ${server.filter((e) => e.ev === 'score_delete').length}`);
say(`ОШИБОК СЕРВЕРА (500): ${errors500.length}`);
say(`ошибок скриптов на устройствах: ${client.filter((e) => /^js_/.test(e.step)).length}`);
if (notJson) say(`строк журнала не в JSON (служебные сообщения Next): ${notJson}`);

/* ------------------------------ Воронка участника ------------------------------ */

head('ВОРОНКА: СКОЛЬКО УСТРОЙСТВ ДОШЛО ДО ШАГА');
const reached = new Map();
for (const e of client) {
  if (!e.dev) continue;
  const step = e.step === 'screen' ? `screen:${(() => { try { return JSON.parse(e.detail ?? '{}').to; } catch { return '?'; } })()}` : e.step;
  if (!reached.has(step)) reached.set(step, new Set());
  reached.get(step).add(e.dev);
}
for (const step of ['app_start', 'login_submit', 'login_ok', 'login_fail', 'screen:quizPick', 'screen:quiz', 'quiz_loaded', 'quiz_load_fail', 'topic_start', 'answer_fail', 'screen:stations', 'screen:sports', 'player_finish']) {
  say(`  ${step.padEnd(18)} ${String(reached.get(step)?.size ?? 0).padStart(6)}`);
}
const started = reached.get('app_start') ?? new Set();
const loggedIn = reached.get('login_ok') ?? new Set();
const savedStart = client.filter((e) => e.step === 'app_start' && /"saved":true/.test(e.detail ?? '')).map((e) => e.dev);
const stuck = [...started].filter((d) => !loggedIn.has(d) && !savedStart.includes(d));
say(`  открыли сайт, но так и не вошли: ${stuck.length} устройств`);

/* ------------------------------ Что видели люди ------------------------------ */

const detailOf = (e) => {
  try {
    return JSON.parse(e.detail ?? '{}');
  } catch {
    return { raw: e.detail };
  }
};

head('ОШИБКИ ВХОДА (текст, который увидел человек)');
const loginFails = new Map();
for (const e of client.filter((x) => x.step === 'login_fail')) inc(loginFails, detailOf(e).error ?? '?');
for (const e of server.filter((x) => x.ev === 'api_invalid' || x.ev === 'api_reject')) {
  if ((e.error ?? '').match(/[Нн]ик|юзернейм/)) inc(loginFails, `[сервер] ${e.error}`);
}
for (const [k, v] of top(loginFails)) say(`  ${String(v).padStart(5)}  ${k}`);
if (!loginFails.size) say('  нет');

head('СБОИ НА УСТРОЙСТВАХ (шаг → сколько раз)');
const bad = new Map();
for (const e of client.filter((x) => x.lvl === 'warn' || x.lvl === 'error')) inc(bad, e.step);
for (const [k, v] of top(bad, 30)) say(`  ${String(v).padStart(5)}  ${k}`);
if (!bad.size) say('  нет');

head('ТЕКСТЫ ОШИБОК НА УСТРОЙСТВАХ');
const texts = new Map();
for (const e of client.filter((x) => x.lvl !== 'info')) {
  const d = detailOf(e);
  const t = d.error ?? d.reason ?? d.raw;
  if (t) inc(texts, `${e.step}: ${d.url ? `${d.url} ` : ''}${d.status ? `[${d.status}] ` : ''}${t}`);
}
for (const [k, v] of top(texts, 25)) say(`  ${String(v).padStart(5)}  ${k.slice(0, 160)}`);
if (!texts.size) say('  нет');

head('ОШИБКИ СЕРВЕРА 500 (код из сообщения участнику = rid)');
for (const e of errors500.slice(0, 40)) {
  say(`  ${msk(e.t)} rid=${e.rid} порт=${e.port} dev=${e.dev ?? '-'} ${e.error}${e.code ? ` (pg ${e.code})` : ''}`);
  if (e.stack) say(`      ${e.stack.slice(0, 240)}`);
}
if (!errors500.length) say('  нет');

head('ОТКАЗЫ СЕРВЕРА 4xx (что и сколько)');
const rejects = new Map();
for (const e of server.filter((x) => x.ev === 'api_reject' || x.ev === 'api_invalid' || x.ev === 'api_unauthorized')) {
  inc(rejects, `${e.status} ${e.error ?? e.ev}`);
}
for (const [k, v] of top(rejects, 20)) say(`  ${String(v).padStart(5)}  ${k}`);
if (!rejects.size) say('  нет');

head('СВЯЗЬ НА УСТРОЙСТВАХ');
const offlines = client.filter((e) => e.step === 'net_online').map((e) => detailOf(e).offlineS).filter((s) => typeof s === 'number');
say(`  пропаданий сети (браузер сам заметил): ${client.filter((e) => e.step === 'net_offline').length}, вернулась: ${offlines.length}`);
if (offlines.length) {
  const s = [...offlines].sort((a, b) => a - b);
  say(`  сколько длилось, с: медиана ${pct(s, 50)}, 95% ${pct(s, 95)}, максимум ${s[s.length - 1]}`);
}
const queued = client.filter((e) => e.queued);
say(`  отметок, которые ждали связи на устройстве и дошли позже: ${queued.length}`);
say(`  запрос не прошёл после всех повторов (net_fail / admin_net_fail): ${client.filter((e) => e.step === 'net_fail' || e.step === 'admin_net_fail').length}`);
say(`  медленные ответы > 5 с (slow / admin_slow): ${client.filter((e) => e.step === 'slow' || e.step === 'admin_slow').length}, ответ на вопрос > 3 с: ${client.filter((e) => e.step === 'answer_slow').length}`);

head('ПАНЕЛЬ ВОЛОНТЁРОВ');
const adm = (ev) => server.filter((e) => e.ev === ev).length;
const admc = (st) => client.filter((e) => e.step === st).length;
say(`  входов оператора: ${adm('admin_login_ok')}, неверный пароль: ${adm('admin_login_fail')}, блокировок перебора: ${adm('admin_login_blocked')}, выходов: ${adm('admin_logout')}`);
say(`  открытий панели: ${admc('admin_start')}, потеря сессии (401): ${admc('admin_session_lost')}`);
say(`  записей сохранено сразу: ${admc('score_saved')}, ушло в очередь (нет связи/сбой): ${admc('score_queued')}`);
say(`  очередь: дослано ${admc('outbox_sent')}, ждали повтора ${admc('outbox_retry_later')}, ОТКЛОНЕНО сервером ${admc('outbox_rejected')}`);
for (const e of client.filter((x) => x.step === 'outbox_rejected')) say(`    ! ${msk(e.t)} dev=${e.dev} ${e.detail}`);
say(`  поиск без связи (из памяти): ${admc('search_offline')}`);

/* ------------------------------ Время по минутам ------------------------------ */

head('ПЛОХИЕ МИНУТЫ (по МСК): сбои на устройствах и сервере');
const byMinute = new Map();
for (const e of events) {
  if (e.lvl === 'info') continue;
  inc(byMinute, msk(e.t).slice(0, 5));
}
const badMinutes = [...byMinute.entries()].filter(([, v]) => v >= 3).sort((a, b) => a[0].localeCompare(b[0]));
for (const [m, v] of badMinutes.slice(0, 60)) say(`  ${m}  ${'#'.repeat(Math.min(v, 60))} ${v}`);
if (!badMinutes.length) say('  нет минут с тремя и больше сбоями');

/* ------------------------------ nginx ------------------------------ */

const nginx = read('nginx.log');
if (nginx.length) {
  head('ЗАПРОСЫ (nginx)');
  const status = new Map();
  const timesByRoute = new Map();
  const fiveXX = [];
  const perMinute = new Map();
  for (const line of nginx) {
    const m = line.match(/^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+)[^"]*" (\d{3}) \S+ "[^"]*" "[^"]*"(?: rt=(\S+) urt=(\S+) up=(\S+) rid=(\S+) dev=(\S*))?/);
    if (!m) continue;
    const [, ip, time, method, uri, code, rt, urt, up, rid] = m;
    inc(status, code[0] + 'xx');
    const route = uri.split('?')[0].replace(/\/\d+(?=\/|$)/g, '/:id');
    if (rt && route.startsWith('/api/') && route !== '/api/trace') {
      if (!timesByRoute.has(`${method} ${route}`)) timesByRoute.set(`${method} ${route}`, []);
      timesByRoute.get(`${method} ${route}`).push(Number(rt) * 1000);
    }
    const hm = time.slice(12, 17);
    if (!perMinute.has(hm)) perMinute.set(hm, { n: 0, e: 0 });
    perMinute.get(hm).n += 1;
    if (code.startsWith('5')) {
      perMinute.get(hm).e += 1;
      fiveXX.push(`${time.slice(12, 20)} ${code} ${method} ${uri.slice(0, 60)} ip=${ip} up=${up ?? '?'} urt=${urt ?? '?'} rid=${rid ?? '?'}`);
    }
  }
  say(`  всего: ${nginx.length}; ${[...status.entries()].map(([k, v]) => `${k}: ${v}`).join(', ')}`);
  const busiest = [...perMinute.entries()].sort((a, b) => b[1].n - a[1].n)[0];
  if (busiest) say(`  самая нагруженная минута: ${busiest[0]} — ${busiest[1].n} запросов (${(busiest[1].n / 60).toFixed(1)} в секунду)`);

  head('ВРЕМЯ ОТВЕТА API, мс (медиана / 95% / максимум, число запросов)');
  for (const [route, list] of [...timesByRoute.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const s = list.sort((a, b) => a - b);
    const flag = pct(s, 95) > 1000 ? '  ← медленно' : '';
    say(`  ${route.padEnd(36)} ${String(Math.round(pct(s, 50))).padStart(6)} / ${String(Math.round(pct(s, 95))).padStart(6)} / ${String(Math.round(s[s.length - 1])).padStart(6)}  (${s.length})${flag}`);
  }

  head('ОТВЕТЫ 5xx ОТ nginx (502/504 — процесс не ответил или перезапускался)');
  for (const l of fiveXX.slice(0, 40)) say(`  ${l}`);
  if (fiveXX.length > 40) say(`  … и ещё ${fiveXX.length - 40}`);
  if (!fiveXX.length) say('  нет');
}

/* ------------------------------ Монитор сервера ------------------------------ */

const monitor = read('monitor.log');
if (monitor.length) {
  head('СЕРВЕР (снимки раз в 30 секунд)');
  let maxLoad = 0;
  let minMem = Infinity;
  let maxConn = 0;
  const problems = [];
  for (const line of monitor) {
    const load = Number(line.match(/load=([\d.]+)/)?.[1] ?? 0);
    const mem = Number(line.match(/mem_free_mb=(\d+)/)?.[1] ?? Infinity);
    const conn = Number(line.match(/pg_conn=(\d+)/)?.[1] ?? 0);
    maxLoad = Math.max(maxLoad, load);
    minMem = Math.min(minMem, mem);
    maxConn = Math.max(maxConn, conn);
    if (/WORKER_DOWN|DISK_FULL|PG_DOWN/.test(line)) problems.push(line);
  }
  say(`  снимков: ${monitor.length}, наибольшая нагрузка (load1): ${maxLoad}, наименьшая свободная память: ${minMem} МБ, соединений с базой max: ${maxConn}`);
  say(`  проблем (процесс не ответил, база недоступна, диск): ${problems.length}`);
  for (const l of problems.slice(0, 30)) say(`  ! ${l}`);
}

/* ------------------------------ Проблемные устройства ------------------------------ */

head('УСТРОЙСТВА С ПРОБЛЕМАМИ (первые 25): путь по шагам');
const byDev = new Map();
for (const e of client) {
  if (!e.dev) continue;
  if (!byDev.has(e.dev)) byDev.set(e.dev, []);
  byDev.get(e.dev).push(e);
}
let shown = 0;
for (const [dev, list] of byDev) {
  if (!list.some((e) => e.lvl !== 'info')) continue;
  if (shown++ >= 25) break;
  const ua = list.find((e) => e.ua)?.ua ?? '';
  // По времени на устройстве: отметка, ждавшая связи, встаёт на своё место.
  const when = (e) => e.at ?? e.t;
  const ordered = [...list].sort((a, b) => when(a).localeCompare(when(b)));
  say(`  dev=${dev} участник=${list.find((e) => e.player)?.player ?? '-'} ${ua.slice(0, 90)}`);
  say(`    ${ordered.slice(-14).map((e) => `${msk(when(e))} ${e.step}${e.lvl !== 'info' ? '!' : ''}${e.queued ? '(ждала связи)' : ''}`).join(' → ')}`);
}
if (!shown) say('  нет');

say('');
say('Как искать подробности: grep по rid=… в nginx.log и app.jsonl, по dev=… — весь путь устройства.');
process.stdout.write(`${out.join('\n')}\n`);
