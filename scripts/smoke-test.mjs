/**
 * Сквозная проверка стенда против запущенного сервера.
 *
 *   node scripts/smoke-test.mjs [http://localhost:3000] [пароль_админа]
 *
 * Скрипт не останавливается на первой ошибке: на площадке важно увидеть
 * сразу весь список проблем, а не чинить их по одной.
 */

const BASE = process.argv[2] ?? 'http://localhost:3000';
const ADMIN_PASSWORD = process.argv[3] ?? 'teboil2026';

let passed = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  ПРОЙДЕНО  ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ПРОВАЛЕНО ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function api(path, init) {
  const response = await fetch(`${BASE}${path}`, init);
  let body = null;
  try {
    body = await response.json();
  } catch {
    /* не JSON — оставляем null */
  }
  return { status: response.status, body, headers: response.headers };
}

const postJson = (path, data, extra = {}) =>
  api(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(extra.headers ?? {}) },
    body: JSON.stringify(data),
    ...extra,
  });

/* ------------------------------ Вход участника ----------------------------- */

async function testLogin() {
  console.log('\nВХОД УЧАСТНИКА ПО ТЕЛЕГРАМ-ЮЗЕРНЕЙМУ');
  const username = `test_fox_${Date.now() % 100000}`;

  const first = await postJson('/api/players', { nickname: username });
  check('вход по юзернейму', first.body?.ok === true, first.body?.error);
  const id = first.body?.data?.id;

  const withAt = await postJson('/api/players', { nickname: `@${username}` });
  check('юзернейм с «@» — тот же участник', withAt.body?.data?.id === id,
    `${id} vs ${withAt.body?.data?.id}`);

  const upper = await postJson('/api/players', { nickname: username.toUpperCase() });
  check('другой регистр — тот же участник (в Телеграме регистр не важен)',
    upper.body?.data?.id === id, `${id} vs ${upper.body?.data?.id}`);

  const spaced = await postJson('/api/players', { nickname: `  @${username}  ` });
  check('пробелы по краям не создают дубль', spaced.body?.data?.id === id,
    `${id} vs ${spaced.body?.data?.id}`);

  // Кириллица и слишком короткие имена на киоске недопустимы: под этим
  // юзернеймом человеку потом выдают приз.
  for (const bad of ['Вася', 'кириллица_тут', 'ab', '1startsdigit', 'has space', '', '@']) {
    const res = await postJson('/api/players', { nickname: bad });
    check(`не юзернейм «${bad.slice(0, 14)}» отклонён с 400`, res.status === 400,
      `HTTP ${res.status}`);
  }

  const noField = await postJson('/api/players', {});
  check('пустое тело не роняет сервер', noField.status === 400,
    `HTTP ${noField.status}`);

  const manual = await postJson('/api/players/manual', { nickname: 'Без Юзернейма' });
  check('ручное заведение участника требует сессию оператора',
    manual.status === 401, `HTTP ${manual.status}`);

  return id;
}

/* ---------------------------------- Квиз ---------------------------------- */

async function testQuiz(playerId) {
  console.log('\nКВИЗ С РУЛЕТКОЙ');

  for (const variant of ['v1', 'v2']) {
    const res = await api(`/api/quiz?variant=${variant}`);
    const data = res.body?.data;
    check(`${variant}: вопросы загружаются`, res.body?.ok === true, res.body?.error);
    if (!data) continue;

    check(`${variant}: три уровня`, data.levels.length === 3,
      `уровней ${data.levels.length}`);

    for (const level of data.levels) {
      const themes = new Set(level.questions.map((q) => q.theme));
      check(`${variant} уровень ${level.level}: есть темы для колеса`,
        themes.size > 0 && level.questions.length > 0,
        `${level.questions.length} вопросов / ${themes.size} тем`);
    }

    const raw = JSON.stringify(data);
    check(`${variant}: правильный ответ не утекает в список вопросов`,
      !raw.includes('correctIndex') && !raw.includes('"fact"'));
  }

  const bad = await api('/api/quiz?variant=v9');
  check('неизвестный вариант отклонён', bad.status === 400, `HTTP ${bad.status}`);

  // Ответ на вопрос и защита от повторного начисления.
  const quiz = (await api('/api/quiz?variant=v1')).body?.data;
  const question = quiz?.levels?.[0]?.questions?.[0];
  if (!question || !playerId) return;

  const first = await postJson('/api/quiz/answer', {
    playerId, variant: 'v1', questionId: question.id, answerIndex: 0, bet: false,
  });
  check('ответ на вопрос принимается', first.body?.ok === true, first.body?.error);
  check('сервер возвращает правильный вариант и факт',
    typeof first.body?.data?.correctIndex === 'number' &&
    'fact' in (first.body?.data ?? {}));

  const repeat = await postJson('/api/quiz/answer', {
    playerId, variant: 'v1', questionId: question.id, answerIndex: 0, bet: false,
  });
  check('повторный ответ на тот же вопрос не начисляет баллы снова',
    repeat.body?.data?.alreadyAnswered === true && repeat.body?.data?.points === 0,
    JSON.stringify(repeat.body?.data));

  const ghost = await postJson('/api/quiz/answer', {
    playerId, variant: 'v1', questionId: 'нет-такого', answerIndex: 0, bet: false,
  });
  check('несуществующий вопрос отклонён', ghost.status === 404, `HTTP ${ghost.status}`);
}

/* --------------------------- Защита админ-функций -------------------------- */

async function testAdminGuard(playerId) {
  console.log('\nДОСТУП БЕЗ СЕССИИ ОПЕРАТОРА');

  const score = await postJson('/api/score', {
    playerId, activity: 'sport_darts', points: 100, createdBy: 'admin',
  });
  check('начисление от имени админа требует сессию', score.status === 401,
    `HTTP ${score.status}`);

  const del = await api('/api/score?id=1', { method: 'DELETE' });
  check('удаление начисления требует сессию', del.status === 401,
    `HTTP ${del.status}`);

  const create = await postJson('/api/photo-questions', {
    imagePath: '/x.jpg', question: 'q', options: ['1', '2', '3', '4'],
    correctIndex: 0, points: 25, active: true,
  });
  check('создание фото-вопроса требует сессию', create.status === 401,
    `HTTP ${create.status}`);

  const upload = await api('/api/photo-questions/upload', {
    method: 'POST', body: new FormData(),
  });
  check('загрузка файла требует сессию', upload.status === 401,
    `HTTP ${upload.status}`);

  const adminList = await api('/api/photo-questions?admin=1');
  const leaked = JSON.stringify(adminList.body ?? {}).includes('correctIndex');
  check('без сессии нельзя получить ответы через ?admin=1',
    adminList.status === 401 || !leaked, `HTTP ${adminList.status}`);

  const publicList = await api('/api/photo-questions');
  check('публичный список фото-вопросов без correctIndex',
    !JSON.stringify(publicList.body ?? {}).includes('correctIndex'));
}

/* ------------------------ Начисление и счётчики дня ------------------------ */

async function testScoringAndStats(playerId) {
  console.log('\nНАЧИСЛЕНИЕ ОПЕРАТОРОМ И СТАТИСТИКА');

  const login = await postJson('/api/admin/login', { password: ADMIN_PASSWORD });
  check('вход оператора по паролю', login.body?.ok === true, login.body?.error);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) {
    check('cookie сессии получена', false);
    return;
  }
  const auth = { headers: { cookie } };

  const wrongPassword = await postJson('/api/admin/login', { password: 'неверный' });
  check('неверный пароль отклонён', wrongPassword.status === 401,
    `HTTP ${wrongPassword.status}`);

  const before = (await api('/api/stats')).body?.data;

  const award = await postJson('/api/score', {
    playerId, activity: 'sport_darts', points: 21, rawResult: '42',
    createdBy: 'admin',
  }, auth);
  check('оператор начисляет баллы за дартс', award.body?.ok === true,
    award.body?.error);
  const eventId = award.body?.data?.event?.id;

  const after = (await api('/api/stats')).body?.data;
  check('счётчик спорт-активностей вырос или уже учитывал игрока',
    (after?.sportPlayers ?? 0) >= (before?.sportPlayers ?? 0),
    `${before?.sportPlayers} -> ${after?.sportPlayers}`);
  check('баллы дня выросли ровно на начисленное',
    (after?.totalPoints ?? 0) - (before?.totalPoints ?? 0) === 21,
    `${before?.totalPoints} -> ${after?.totalPoints}`);

  const manual = await postJson('/api/players/manual', {
    nickname: `Без юзернейма ${Date.now() % 1000}`,
  }, auth);
  check('оператор заводит участника без юзернейма', manual.body?.ok === true,
    manual.body?.error);

  const badManual = await postJson('/api/players/manual', { nickname: 'Я' }, auth);
  check('слишком короткое имя при ручном заведении отклонено',
    badManual.status === 400, `HTTP ${badManual.status}`);

  const csv = await fetch(`${BASE}/api/export`, { headers: { cookie } });
  // Читаем байтами: text() сам срезает BOM при декодировании, и проверка
  // «есть ли BOM» на строке всегда была бы ложноотрицательной.
  const bytes = new Uint8Array(await csv.arrayBuffer());
  const text = new TextDecoder('utf-8').decode(bytes);
  check('выгрузка таблицы отдаётся оператору', csv.status === 200,
    `HTTP ${csv.status}`);
  check('файл начинается с BOM — Excel откроет кириллицу правильно',
    bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf,
    `первые байты: ${[...bytes.slice(0, 3)].join(',')}`);
  // Шапка согласована с заказчиком по его макету таблицы: строка на участника,
  // колонка на активность, сумма справа.
  check('таблица построена по макету заказчика',
    text.includes('Имя пользователя') &&
    text.includes('Сумма баллов') &&
    text.includes('автоматическое заполнение') &&
    text.includes('ручное заполнение'),
    text.slice(0, 80));

  const csvNoAuth = await fetch(`${BASE}/api/export`);
  check('выгрузка без сессии запрещена', csvNoAuth.status === 401,
    `HTTP ${csvNoAuth.status}`);

  const board = (await api('/api/leaderboard?limit=10')).body?.data;
  const sorted = (board?.rows ?? []).every(
    (row, i, arr) => i === 0 || arr[i - 1].points >= row.points,
  );
  check('лидерборд отсортирован по убыванию баллов', sorted);
  check('лидерборд за сегодняшний день',
    board?.day === new Date().toLocaleDateString('sv-SE'), board?.day);

  const overLimit = await postJson('/api/score', {
    playerId, activity: 'sport_darts', points: 100000, createdBy: 'admin',
  }, auth);
  check('нереальное число баллов отклонено', overLimit.status === 400,
    `HTTP ${overLimit.status}`);

  if (eventId) {
    const removed = await api(`/api/score?id=${eventId}`, {
      method: 'DELETE', ...auth,
    });
    check('оператор может отменить ошибочное начисление',
      removed.body?.ok === true, removed.body?.error);

    const restored = (await api('/api/stats')).body?.data;
    check('после отмены баллы дня вернулись к прежним',
      restored?.totalPoints === before?.totalPoints,
      `${restored?.totalPoints} vs ${before?.totalPoints}`);

    const again = await api(`/api/score?id=${eventId}`, { method: 'DELETE', ...auth });
    check('повторная отмена не роняет сервер', again.status === 404,
      `HTTP ${again.status}`);
  }
}

/* ---------------------------------- Запуск --------------------------------- */

console.log(`Проверяем ${BASE}`);

const playerId = await testLogin();
await testQuiz(playerId);
await testAdminGuard(playerId);
await testScoringAndStats(playerId);

console.log(`\nИТОГ: пройдено ${passed}, провалено ${failures.length}`);
if (failures.length > 0) {
  console.log('\nПроблемы:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
