/**
 * Дописывает к уже сохранённым ответам квиза тексты: вопрос, выбранный
 * вариант, правильный вариант, тему и вариант квиза.
 *
 * Раньше в журнале хранились только номера (questionId, answerIndex). Пока
 * банк вопросов не меняли, по ним всё восстанавливается, но после любой
 * правки вопросов старые ответы стало бы невозможно прочитать. Скрипт
 * фиксирует тексты сейчас, пока банк совпадает с тем, что спрашивали.
 *
 *   DATABASE_URL=… node scripts/backfill-quiz-text.mjs           — проба, ничего не пишет
 *   DATABASE_URL=… node scripts/backfill-quiz-text.mjs --apply   — записать
 *
 * Только добавляет поля в meta (`meta || новые_поля`), ничего не удаляет и
 * не трогает баллы. Повторный запуск безопасен: уже дополненные строки
 * пропускаются.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const FILES = { quiz_roulette_v1: ['v1', 'quiz1.json'], quiz_roulette_v2: ['v2', 'quiz2.json'] };

/** activity → questionId → данные вопроса. Тема — как в src/lib/quiz.ts. */
const bank = {};
for (const [activity, [variant, file]] of Object.entries(FILES)) {
  const quiz = JSON.parse(fs.readFileSync(path.join('src', 'data', file), 'utf8'));
  bank[activity] = new Map();
  for (const topic of quiz.topics) {
    for (const q of topic.questions) {
      bank[activity].set(q.id, { variant, theme: (q.theme ?? topic.title).trim(), ...q });
    }
  }
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const { rows } = await client.query(
  `SELECT id, activity, meta FROM score_events
    WHERE meta->>'kind' = 'answer' AND NOT (meta ? 'question')
    ORDER BY id`,
);

let ready = 0;
const missing = [];
const patches = [];
for (const row of rows) {
  const q = bank[row.activity]?.get(row.meta.questionId);
  if (!q) {
    missing.push(`${row.id}:${row.meta.questionId}`);
    continue;
  }
  const index = Number(row.meta.answerIndex);
  patches.push([row.id, {
    variant: q.variant,
    theme: q.theme,
    question: q.question,
    answer: q.options[index] ?? null,
    correctAnswer: q.options[q.correctIndex] ?? null,
  }]);
  ready += 1;
}

console.log(`Ответов без текстов: ${rows.length}`);
console.log(`Можно дополнить:      ${ready}`);
console.log(`Вопрос не найден:     ${missing.length}${missing.length ? ` (${missing.slice(0, 10).join(', ')})` : ''}`);
if (patches[0]) console.log('Пример дополнения:', JSON.stringify(patches[0][1]));

if (!APPLY) {
  console.log('\nПроба — в базу ничего не записано. Для записи: --apply');
} else {
  await client.query('BEGIN');
  try {
    for (const [id, patch] of patches) {
      await client.query('UPDATE score_events SET meta = meta || $2::jsonb WHERE id = $1', [id, JSON.stringify(patch)]);
    }
    await client.query('COMMIT');
    console.log(`\nЗаписано: ${patches.length}`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Ошибка, изменения откатены:', e.message);
    process.exitCode = 1;
  }
}
await client.end();
