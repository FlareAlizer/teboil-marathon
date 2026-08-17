/**
 * Валидатор банка вопросов против docs/source/*.md
 *
 *   node scripts/check-quiz.js [путь-к-src/data]
 *
 * Структура: quiz1 = 72 вопроса (8 рубрик x 9), quiz2 = 21 (3 уровня x 7, поле level).
 * У каждого вопроса ровно 4 варианта, correctIndex — целое 0..3, без пустых строк и дублей id.
 *
 * Сверка ответов идёт ПО ТЕКСТУ, а не по позиции: для каждого вопроса из источника задан
 * фрагмент формулировки и фрагмент правильного ответа. Так проверка не ломается от
 * перестановки вопросов/вариантов и ловит именно смысловую ошибку в correctIndex.
 *
 * Код возврата: 0 — чисто, 1 — есть критичные дефекты.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const dataDir = process.argv[2] || path.join(__dirname, '..', 'src', 'data');

/* Эталон: [фрагмент вопроса, фрагмент правильного ответа] — из docs/source/quiz1-rubrics.md */
const KEY1 = [
  ['классическом марафоне', '42,195'],
  ['«мотором»', 'Сердце'],
  ['костей в теле', '206'],
  ['зародились Олимпийские', 'Греция'],
  ['самой большой в теле', 'ягодичная'],
  ['чувство жжения', 'Лактат'],
  ['аэробной нагрузке', 'Кислород'],
  ['максимальное потребление кислорода организмом', 'МПК'],
  ['вторым дыханием', 'устойчивый режим'],

  ['полумарафоном', '21,1'],
  ['Бостонский марафон', 'Бостон'],
  ['дистанция в лёгкой атлетике 100 метров', 'Спринт'],
  ['входит в серию World Marathon Majors', '7'],
  ['греческое селение', 'Марафон'],
  ['помимо Бостона', 'Лондон, Берлин, Токио'],
  ['первым в истории пробежал марафон быстрее 2 часов', 'Кипчоге'],
  ['Келвин Киптум', '2:00:35'],
  ['приземляется на переднюю', 'Forefoot'],

  ['измеряет пульсометр', 'Частоту сердечных'],
  ['процесс восстановления после интенсивной', 'Восстановление'],
  ['каденс в беге', 'Частота шагов'],
  ['пульсовых зон', '5'],
  ['каденс считается оптимальным', '170'],
  ['чередовании быстрых отрезков', 'Интервальная'],
  ['ПАНО', 'лактат начинает резко'],
  ['приблизительного расчёта максимальной ЧСС', '220 минус возраст'],
  ['базовая аэробная выносливость', '2 зона'],

  ['главным источником энергии', 'Углеводы'],
  ['избежать обезвоживания', 'Пить воду и изотоники'],
  ['спортивным изотоникам', 'электролитами и углеводами'],
  ['углеводное окно', 'лучше усваивает углеводы'],
  ['электролиты особенно важны', 'Натрий, калий, магний'],
  ['до старта марафона', 'Овсянку'],
  ['углеводная загрузка', 'Постепенное увеличение'],
  ['«стена» у марафонцев', 'истощения запасов гликогена'],
  ['энергетических гелей', 'мальтодекстрин'],

  ['часов сна', '7'],
  ['вредной для спортсмена', 'Курение'],
  ['справиться со стрессом', 'Регулярная физическая'],
  ['улучшает настроение', 'Эндорфин'],
  ['регуляцию сна', 'Мелатонин'],
  ['представляет успешный забег', 'Визуализация'],
  ['гормон стресса', 'Кортизол'],
  ['эффект бегуна', 'эйфории'],
  ['стадия сна наиболее важна', 'глубокий сон'],

  // Рубрика «Мифы и факты» — Правда/Ложь, максимальный риск инверсии
  ['статической и долгой', 'Ложь'],
  ['Пить воду во время бега вредно', 'Ложь'],
  ['полезен для сердечно-сосудистой', 'Правда'],
  ['больше пота', 'Ложь'],
  ['убивает колени', 'Ложь'],
  ['вечером обязательно откладываются', 'Ложь'],
  ['иммунитет временно снижается', 'Правда'],
  ['крепатуры', 'Ложь'],
  ['Кофеин может улучшать выносливость', 'Правда'],

  ['выборе беговых кроссовок', 'пронации'],
  ['обязательно взять с собой на марафон', 'Стартовый номер'],
  ['судороге', 'растянуть мышцу'],
  ['заваливается внутрь', 'Гиперпронация'],
  ['теплового удара', 'Обильное свежее потоотделение'],
  ['стоит сойти с дистанции', 'острой боли в груди'],
  ['совершенно новых кроссовках', 'Не разношены'],
  ['падает уровень натрия', 'Гипонатриемия'],
  ['увеличении беговой нагрузки', '10%'],

  ['используется моторное масло', 'смазки, охлаждения'],
  ['страны бренд Teboil', 'Финляндия'],
  ['линейки моторных масел', 'Diamond, Gold, Silver'],
  ['SAE 5W-30', 'Вязкость'],
  ['устойчивым к экстремальным', 'Синтетическое'],
  ['технология моторного масла Teboil', 'Carbon-to-Lubes'],
  ['буква W', 'Winter'],
  ['FE в названии', 'Fuel Economy'],
  ['межсервисный интервал', '10 000'],
];

/* Эталон quiz2 — из docs/source/quiz2-levels.md. Русские А/Б/В/Г: Б=1, В=2 — частый источник ошибки. */
const KEY2 = [
  // Уровень 1
  ['точная длина классической', '42 километра 195'],
  ['аналогичная «заправка» для бегунов', 'Пункт питания'],
  ['категорически не рекомендуется бежать свой первый', 'новых'],
  ['чашечку кофе', '45-60 минут'],
  ['схватиться за бок', 'диафрагмы'],
  ['естественной «смазкой» для суставов', 'Синовиальная'],
  ['барьер впервые в истории преодолел', 'быстрее 2 часов'],
  // Уровень 2
  ['самым старым в мире', 'Бостонский'],
  ['накопительный показатель', 'Беговой объем'],
  ['частота шагов бегуна в минуту', 'Каденс'],
  ['много пасты и риса', 'Углеводная загрузка'],
  ['30-35 километре', 'Марафонская стена'],
  ['многослойности', 'капусты'],
  ['подошву современных топовых', 'Карбоновая пластина'],
  // Уровень 3
  ['отводит до 80% избыточного тепла', 'пота'],
  ['финишировавший на всех шести', 'Six Star'],
  ['английской аббревиатуре', 'VO2'],
  ['лучшие мировые рекорды на марафоне', '+10'],
  ['На каком из мэйджоров', 'Чикаго'],
  ['детский напиток', 'Шоколадное молоко'],
  ['пейсмейкер', 'ровным темпом'],
];

const problems = [];
const add = (sev, msg) => problems.push({ sev, msg });

const norm = (s) => String(s == null ? '' : s)
  .toLowerCase().replace(/ё/g, 'е').replace(/[«»"'`]/g, '').replace(/[‐-―]/g, '-')
  .replace(/\s+/g, ' ').trim();

function load(file) {
  const p = path.join(dataDir, file);
  if (!fs.existsSync(p)) { add('BLOCK', `Файл не найден: ${p} — банк вопросов ещё не готов.`); return null; }
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { add('CRIT', `${file}: невалидный JSON — ${e.message}`); return null; }
}

function flatten(root) {
  const topics = root.topics || root.rubrics || root.levels || [];
  return topics.flatMap((t) => (t.questions || []).map((q) => ({ ...q, __topic: t.title || t.id })));
}

const optText = (o) => (typeof o === 'string' ? o : o && (o.text || o.label));

function structural(name, qs, expectedTotal) {
  console.log(`\n=== ${name}: ${qs.length} вопросов (ожидается ${expectedTotal}) ===`);
  if (qs.length !== expectedTotal) add('CRIT', `${name}: всего ${qs.length} вопросов, должно быть ровно ${expectedTotal}`);

  const ids = new Map(), texts = new Map();
  qs.forEach((q, i) => {
    const tag = `${name} #${i + 1} [${q.__topic}] ${q.id || ''}`;
    const opts = q.options;
    if (!Array.isArray(opts)) { add('CRIT', `${tag}: нет массива options`); }
    else {
      if (opts.length !== 4) add('CRIT', `${tag}: вариантов ${opts.length}, должно быть 4`);
      opts.forEach((o, j) => { if (!optText(o) || !String(optText(o)).trim()) add('CRIT', `${tag}: пустой вариант №${j}`); });
      const n = opts.map((o) => norm(optText(o)));
      const dup = n.find((v, j) => v && n.indexOf(v) !== j);
      if (dup) add('HIGH', `${tag}: два одинаковых варианта («${dup}»)`);
    }
    const ci = q.correctIndex;
    if (!Number.isInteger(ci)) add('CRIT', `${tag}: correctIndex не целое (${JSON.stringify(ci)})`);
    else if (ci < 0 || ci > 3) add('CRIT', `${tag}: correctIndex=${ci} вне 0..3`);
    if (!q.question || !String(q.question).trim()) add('CRIT', `${tag}: пустой текст вопроса`);

    if (q.id != null) {
      if (ids.has(q.id)) add('CRIT', `${tag}: дубль id «${q.id}» (уже у ${ids.get(q.id)})`);
      else ids.set(q.id, tag);
    } else add('HIGH', `${tag}: нет поля id`);
    const tn = norm(q.question);
    if (tn) { if (texts.has(tn)) add('HIGH', `${tag}: дубль текста вопроса (см. ${texts.get(tn)})`); else texts.set(tn, tag); }
  });
}

/* Сверка ответов по тексту */
function verify(name, qs, key) {
  console.log(`\n--- Сверка ответов с источником: ${name} (${key.length} эталонных вопросов) ---`);
  let ok = 0;
  const matched = new Set();
  for (const [qFrag, aFrag] of key) {
    const hits = qs.filter((q) => norm(q.question).includes(norm(qFrag)));
    if (hits.length === 0) { add('HIGH', `${name}: в JSON не найден вопрос «${qFrag}» — ответ не сверен`); continue; }
    if (hits.length > 1) add('LOW', `${name}: фрагмент «${qFrag}» подходит к ${hits.length} вопросам, беру первый`);
    const q = hits[0];
    matched.add(q.id || norm(q.question));
    const opts = q.options || [];
    const chosen = optText(opts[q.correctIndex]);
    if (norm(chosen).includes(norm(aFrag))) { ok++; continue; }
    const shouldBe = opts.findIndex((o) => norm(optText(o)).includes(norm(aFrag)));
    add('CRIT',
      `НЕВЕРНЫЙ ОТВЕТ — ${name} [${q.__topic}] ${q.id || ''}: correctIndex=${q.correctIndex} ` +
      `указывает на «${chosen}», а по источнику правильный ответ — ` +
      (shouldBe >= 0 ? `индекс ${shouldBe} («${optText(opts[shouldBe])}»)` : `вариант, содержащий «${aFrag}» (в options его нет!)`) +
      `. Вопрос: «${String(q.question).slice(0, 95)}»`);
  }
  console.log(`Совпало с источником: ${ok} из ${key.length}`);
  for (const q of qs) {
    if (!matched.has(q.id || norm(q.question))) add('LOW', `${name}: вопрос ${q.id || ''} «${String(q.question).slice(0, 60)}» не сверялся (нет в эталоне)`);
  }
}

/* ------------------------------- quiz1 ------------------------------- */
const q1 = load('quiz1.json');
if (q1) {
  const qs = flatten(q1);
  structural('quiz1', qs, 72);
  const byTopic = {};
  qs.forEach((q) => (byTopic[q.__topic] = (byTopic[q.__topic] || 0) + 1));
  console.log('Рубрики:', Object.entries(byTopic).map(([k, v]) => `${k} (${v})`).join(', '));
  if (Object.keys(byTopic).length !== 8) add('CRIT', `quiz1: рубрик ${Object.keys(byTopic).length}, должно быть 8`);
  for (const [t, n] of Object.entries(byTopic)) if (n !== 9) add('CRIT', `quiz1 / «${t}»: ${n} вопросов вместо 9`);
  verify('quiz1', qs, KEY1);
}

/* ------------------------------- quiz2 ------------------------------- */
const q2 = load('quiz2.json');
if (q2) {
  const qs = flatten(q2);
  structural('quiz2', qs, 21);
  const byLevel = {};
  qs.forEach((q) => (byLevel[q.level] = (byLevel[q.level] || 0) + 1));
  console.log('По уровням (поле level):', Object.entries(byLevel).map(([k, v]) => `уровень ${k}: ${v}`).join(', '));
  for (const lv of [1, 2, 3]) {
    if (byLevel[lv] !== 7) add('CRIT', `quiz2: на уровне ${lv} ${byLevel[lv] || 0} вопросов вместо 7`);
  }
  const extra = Object.keys(byLevel).filter((l) => !['1', '2', '3'].includes(String(l)));
  if (extra.length) add('CRIT', `quiz2: вопросы с недопустимым level: ${extra.join(', ')}`);
  verify('quiz2', qs, KEY2);
}

/* -------------------------------- итог -------------------------------- */
const order = { BLOCK: 0, CRIT: 1, HIGH: 2, LOW: 3 };
problems.sort((a, b) => order[a.sev] - order[b.sev]);
console.log('\n================== ИТОГ ==================');
if (!problems.length) console.log('ПРОЙДЕНО: дефектов в банке вопросов не найдено.');
else {
  for (const p of problems) console.log(`[${p.sev}] ${p.msg}`);
  const n = (s) => problems.filter((p) => p.sev === s).length;
  console.log(`\nКритичных: ${n('CRIT')}, важных: ${n('HIGH')}, мелких: ${n('LOW')}, блокеров: ${n('BLOCK')}`);
}
process.exit(problems.some((p) => p.sev === 'CRIT' || p.sev === 'BLOCK') ? 1 : 0);
