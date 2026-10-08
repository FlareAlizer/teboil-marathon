/**
 * Проверка рейтингов, станций волонтёров и входа по нику.
 *
 *   node scripts/check-ratings.mjs <адрес> <пароль оператора>
 *
 * Создаёт тестовых участников — гонять на локальной базе, не на боевой.
 */
const BASE = process.argv[2] ?? 'http://localhost:3000';
const ADMIN_PASSWORD = process.argv[3];
const RUN = Math.floor(Math.random() * 1e6);

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'ПРОЙДЕНО ' : 'ПРОВАЛЕНО'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed += 1;
}

async function api(path, init = {}) {
  const res = await fetch(BASE + path, init);
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body, headers: res.headers };
}

const post = (path, data, extra = {}) =>
  api(path, {
    method: 'POST',
    ...extra,
    headers: { 'Content-Type': 'application/json', ...(extra.headers ?? {}) },
    body: JSON.stringify(data),
  });

async function player(nickname) {
  const r = await post('/api/players', { nickname });
  return r.body.data.id;
}

/* ------------------------------------------------------------------------ */

console.log('\nЗАЩИТА');
const anon = await post('/api/score', {
  playerId: 1, activity: 'sport_darts', points: 100, rawResult: '999', createdBy: 'auto',
});
check('начисление без входа оператора отклонено (даже с createdBy auto)', anon.status === 401,
  `HTTP ${anon.status}`);
const anonStation = await api('/api/station?board=darts');
check('экран станции без входа закрыт', anonStation.status === 401, `HTTP ${anonStation.status}`);

const login = await post('/api/admin/login', { password: ADMIN_PASSWORD });
const cookie = login.headers.get('set-cookie')?.split(';')[0];
check('вход оператора', Boolean(cookie));
const auth = { headers: { cookie } };
const score = (data) => post('/api/score', data, auth);

const p1 = await player(`rate_one_${RUN}`);
const p2 = await player(`rate_two_${RUN}`);
const p3 = await player(`rate_three_${RUN}`);

console.log('\nПРОВЕРКА РЕЗУЛЬТАТОВ НА СЕРВЕРЕ');
for (const [raw, why] of [['3з', 'с буквой'], ['1000', 'больше 999'], [null, 'пустой']]) {
  const r = await score({ playerId: p1, activity: 'sport_keepups', points: 1, rawResult: raw });
  check(`чеканка: результат ${why} отклонён`, r.status === 400, `HTTP ${r.status}`);
}
const noGoal = await score({ playerId: p1, activity: 'sport_obstacle', points: 10, rawResult: '20' });
check('полоса без отметки гола отклонена', noGoal.status === 400, `HTTP ${noGoal.status}`);
for (const raw of ['0', '12,34']) {
  const r = await score({
    playerId: p1, activity: 'sport_obstacle', points: 10, rawResult: raw, meta: { goal: true },
  });
  check(`полоса: время «${raw}» отклонено`, r.status === 400, `HTTP ${r.status}`);
}

console.log('\nРЕЙТИНГИ');
await score({ playerId: p1, activity: 'sport_keepups', points: 30, rawResult: '30' });
const best = await score({ playerId: p1, activity: 'sport_keepups', points: 45, rawResult: '45' });
await score({ playerId: p2, activity: 'sport_keepups', points: 40, rawResult: '40' });
await score({ playerId: p3, activity: 'sport_keepups', points: 10, rawResult: '10' });

await score({ playerId: p1, activity: 'sport_obstacle', points: 40, rawResult: '20', meta: { goal: true } });
const miss = await score({
  playerId: p2, activity: 'sport_obstacle', points: 35, rawResult: '15,0', meta: { goal: false },
});
check('полоса: промах добавил 10 секунд (15 → 25)', miss.body?.data?.event?.rawResult === '25',
  miss.body?.data?.event?.rawResult);
await score({ playerId: p3, activity: 'sport_obstacle', points: 32, rawResult: '18', meta: { goal: false } });
await score({ playerId: p3, activity: 'sport_obstacle', points: 38, rawResult: '22', meta: { goal: true } });

const boards = (await api('/api/ratings?limit=100')).body?.data?.boards ?? [];
check('четыре рейтинга', boards.map((b) => b.id).join() === 'quiz,keepups,darts,obstacle',
  boards.map((b) => b.id).join());

const order = (id, ids) => {
  const rows = boards.find((b) => b.id === id)?.rows ?? [];
  return ids.map((pid) => rows.find((r) => r.id === pid));
};
const [k1, k2, k3] = order('keepups', [p1, p2, p3]);
check('чеканка: считается лучшая попытка (45, а не 30 и не сумма 75)', k1?.value === 45, k1?.value);
check('чеканка: больше — выше', k1.rank < k2.rank && k2.rank < k3.rank,
  `${k1.rank}, ${k2.rank}, ${k3.rank}`);

const [o1, o2, o3] = order('obstacle', [p1, p2, p3]);
check('полоса: меньше время — выше, промах со штрафом ниже',
  o1.rank < o3.rank && o3.rank < o2.rank,
  `20с гол #${o1.rank}, 22с гол #${o3.rank}, 15с мимо=25 #${o2.rank}`);
check('полоса: у лучшей попытки виден гол', o1.goal === true && o2.goal === false,
  `${o1.goal}, ${o2.goal}`);

const card = (await api(`/api/players/${p1}`)).body?.data;
check('карточка участника: место в чеканке', card?.ratings?.keepups?.rank === k1.rank,
  JSON.stringify(card?.ratings?.keepups));
check('карточка участника: в дартсе ещё не выступал', card?.ratings?.darts === null);

const one = await api('/api/ratings?board=obstacle&limit=5');
check('один рейтинг по ?board=', one.body?.data?.boards?.length === 1 &&
  one.body.data.boards[0].id === 'obstacle');
const bad = await api('/api/ratings?board=football');
check('неизвестный рейтинг отклонён', bad.status === 400, `HTTP ${bad.status}`);

console.log('\nСТАНЦИЯ ВОЛОНТЁРА');
const station = (await api('/api/station?board=obstacle', auth)).body?.data;
const entry = station?.entries?.find((e) => e.playerId === p2);
check('в записях станции видно чистое время и промах',
  entry?.timeSec === 15 && entry?.goal === false && entry?.value === 25, JSON.stringify(entry));

const undo = await api(`/api/score?id=${best.body.data.event.id}`, { method: 'DELETE', ...auth });
check('отмена записи', undo.body?.ok === true);
const after = (await api(`/api/players/${p1}`)).body?.data?.ratings?.keepups;
check('после отмены лучшим стал прошлый результат (30)', after?.value === 30, after?.value);

console.log('\nВХОД ПО НИКУ');
const enter = (nickname) => post('/api/players', { nickname });
const petya = await enter(`Петя Солдат ${RUN}`);
check('ник с пробелом и кириллицей принят', petya.body?.ok === true, petya.body?.error);
const petyaAgain = await enter(`  петя   солдат ${RUN} `);
check('тот же ник в другом регистре и с лишними пробелами — тот же участник',
  petyaAgain.body?.data?.id === petya.body?.data?.id, `${petyaAgain.body?.data?.id} vs ${petya.body?.data?.id}`);

const fox = await enter(`fox_${RUN}`);
for (const variant of [`@fox_${RUN}`, `https://t.me/fox_${RUN}`, `t.me/FOX_${RUN}/`]) {
  const r = await enter(variant);
  check(`«${variant}» — тот же участник, что fox_${RUN}`, r.body?.data?.id === fox.body?.data?.id,
    r.body?.error ?? r.body?.data?.nickname);
}
for (const [value, why] of [['Я', 'из одной буквы'], ['Бегун 🏃', 'со смайликом'], ['x'.repeat(33), 'длиннее 32'], ['   ', 'пустой']]) {
  const r = await enter(value);
  check(`ник ${why} отклонён с понятной ошибкой`, r.status === 400 && typeof r.body?.error === 'string',
    `HTTP ${r.status} ${r.body?.error ?? ''}`);
}
const manual = await post('/api/players/manual', { nickname: `Петя Солдат ${RUN}` }, auth);
check('волонтёр заводит тот же ник — находится тот же участник', manual.body?.data?.id === petya.body?.data?.id,
  `${manual.body?.data?.id} vs ${petya.body?.data?.id}`);

// Адрес теперь попадает в /api/players/[id], который принимает только GET.
const tgGone = await post('/api/players/telegram', { initData: 'x' });
check('вход через Telegram убран', tgGone.status === 404 || tgGone.status === 405, `HTTP ${tgGone.status}`);

console.log(`\nИТОГ: ${failed === 0 ? 'все проверки пройдены' : `провалено ${failed}`}`);
process.exit(failed === 0 ? 0 : 1);
