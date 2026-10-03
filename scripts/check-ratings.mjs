/**
 * Проверка рейтингов, станций волонтёров и входа через Telegram.
 *
 *   node scripts/check-ratings.mjs <адрес> <пароль оператора> <токен бота>
 *
 * Токен бота — тот же, что в TELEGRAM_BOT_TOKEN у проверяемого сервера:
 * тест сам подписывает данные входа так, как это делает Telegram.
 * Создаёт тестовых участников — гонять на локальной базе, не на боевой.
 */
import { createHmac } from 'node:crypto';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const ADMIN_PASSWORD = process.argv[3];
const BOT_TOKEN = process.argv[4];
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

/** Подпись initData так, как это делает Telegram. */
function initData(user, { token = BOT_TOKEN, authDate, signature, signatureInHash = true } = {}) {
  const fields = {
    auth_date: String(authDate ?? Math.floor(Date.now() / 1000)),
    query_id: 'AAHtest',
    user: JSON.stringify(user),
  };
  if (signature) fields.signature = signature;
  const signed = Object.entries(fields).filter(([k]) => signatureInHash || k !== 'signature');
  const check = signed
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
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

if (!BOT_TOKEN) {
  console.log('\nТокен бота не передан — проверку входа через Telegram пропускаю.');
} else {
  console.log('\nВХОД ЧЕРЕЗ TELEGRAM');
  const cfg = (await api('/api/telegram')).body?.data;
  check('сервер отдаёт ссылку для кнопки', typeof cfg?.loginUrl === 'string', cfg?.loginUrl);

  const tgId = 700000000 + RUN;
  const tgLogin = (data) => post('/api/players/telegram', { initData: data });

  const first = await tgLogin(initData({ id: tgId, username: `tg_user_${RUN}`, first_name: 'Тест' }));
  check('вход по подписанным данным', first.body?.ok === true && first.body.data.nickname === `tg_user_${RUN}`,
    first.body?.error ?? first.body?.data?.nickname);

  const again = await tgLogin(initData({ id: tgId, username: `renamed_${RUN}`, first_name: 'Тест' }));
  check('сменил юзернейм — тот же участник, баллы не теряются',
    again.body?.data?.id === first.body?.data?.id, `${again.body?.data?.id} vs ${first.body?.data?.id}`);

  const forged = initData({ id: tgId + 1, username: `forged_${RUN}`, first_name: 'Х' }, { token: '1:WRONG' });
  const f = await tgLogin(forged);
  check('подпись чужим ключом отклонена', f.status === 401, `HTTP ${f.status}`);

  const tampered = initData({ id: tgId, username: `tg_user_${RUN}`, first_name: 'Тест' })
    .replace(encodeURIComponent(String(tgId)), encodeURIComponent(String(tgId + 5)));
  const t = await tgLogin(tampered);
  check('подменённый id отклонён', t.status === 401, `HTTP ${t.status}`);

  const old = await tgLogin(initData({ id: tgId, first_name: 'Тест' }, {
    authDate: Math.floor(Date.now() / 1000) - 3 * 24 * 3600,
  }));
  check('данные трёхдневной давности отклонены', old.status === 401, `HTTP ${old.status}`);

  const noUser = await tgLogin(initData({ id: 900000000 + RUN, first_name: 'Иван 🏃' }));
  const expected = `Иван ${String((900000000 + RUN) % 10000).padStart(4, '0')}`;
  check('без юзернейма — «Имя 1234», а не похожий на чужой @ник',
    noUser.body?.data?.nickname === expected, noUser.body?.data?.nickname);

  const manualId = await player(`merge_me_${RUN}`);
  const merged = await tgLogin(initData({ id: 800000000 + RUN, username: `merge_me_${RUN}`, first_name: 'М' }));
  check('раньше входил на планшете по юзернейму — тот же участник', merged.body?.data?.id === manualId,
    `${merged.body?.data?.id} vs ${manualId}`);

  const sigIn = await tgLogin(initData({ id: 600000000 + RUN, username: `sig_in_${RUN}`, first_name: 'С' },
    { signature: 'abc', signatureInHash: true }));
  const sigOut = await tgLogin(initData({ id: 610000000 + RUN, username: `sig_out_${RUN}`, first_name: 'С' },
    { signature: 'abc', signatureInHash: false }));
  check('новое поле signature принимается в обоих вариантах подписи',
    sigIn.body?.ok === true && sigOut.body?.ok === true, `${sigIn.status}, ${sigOut.status}`);
}

console.log(`\nИТОГ: ${failed === 0 ? 'все проверки пройдены' : `провалено ${failed}`}`);
process.exit(failed === 0 ? 0 : 1);
