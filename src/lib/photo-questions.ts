import { getDb } from './db';
import type { AdminPhotoQuestion, PublicPhotoQuestion } from './types';
import { SCORING } from './scoring';

/* ==========================================================================
   Фото-квиз. Правильный ответ (correct_index) НИКОГДА не покидает сервер
   до того, как участник ответил: наружу отдаётся только PublicPhotoQuestion.
   ========================================================================== */

interface QuestionRow {
  id: number;
  image_path: string;
  question: string;
  options: string;
  correct_index: number;
  points: number;
  active: number;
}

function parseOptionsJson(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function toPublic(row: QuestionRow): PublicPhotoQuestion {
  return {
    id: row.id,
    imagePath: row.image_path,
    question: row.question,
    options: parseOptionsJson(row.options),
    points: row.points,
  };
}

function toAdmin(row: QuestionRow): AdminPhotoQuestion {
  return { ...toPublic(row), correctIndex: row.correct_index, active: row.active === 1 };
}

/** Активные вопросы для участника — без правильного ответа. */
export function listPublicQuestions(): PublicPhotoQuestion[] {
  const rows = getDb()
    .prepare('SELECT * FROM photo_questions WHERE active = 1 ORDER BY id')
    .all() as QuestionRow[];
  return rows.map(toPublic);
}

/** Все вопросы вместе с правильными ответами — только для админки. */
export function listAdminQuestions(): AdminPhotoQuestion[] {
  const rows = getDb()
    .prepare('SELECT * FROM photo_questions ORDER BY id')
    .all() as QuestionRow[];
  return rows.map(toAdmin);
}

function getRow(id: number): QuestionRow | null {
  const row = getDb().prepare('SELECT * FROM photo_questions WHERE id = ?').get(id) as
    | QuestionRow
    | undefined;
  return row ?? null;
}

export function getAdminQuestion(id: number): AdminPhotoQuestion | null {
  const row = getRow(id);
  return row ? toAdmin(row) : null;
}

export interface QuestionInput {
  imagePath: string;
  question: string;
  options: string[];
  correctIndex: number;
  points?: number;
  active?: boolean;
}

export function createQuestion(input: QuestionInput): AdminPhotoQuestion {
  const info = getDb()
    .prepare(
      `INSERT INTO photo_questions (image_path, question, options, correct_index, points, active)
       VALUES (@imagePath, @question, @options, @correctIndex, @points, @active)`,
    )
    .run({
      imagePath: input.imagePath,
      question: input.question,
      options: JSON.stringify(input.options),
      correctIndex: input.correctIndex,
      points: input.points ?? SCORING.photoQuiz.correct,
      active: input.active === false ? 0 : 1,
    });
  return getAdminQuestion(Number(info.lastInsertRowid))!;
}

export function updateQuestion(
  id: number,
  patch: Partial<QuestionInput>,
): AdminPhotoQuestion | null {
  const current = getRow(id);
  if (!current) return null;

  getDb()
    .prepare(
      `UPDATE photo_questions
          SET image_path = @imagePath,
              question = @question,
              options = @options,
              correct_index = @correctIndex,
              points = @points,
              active = @active
        WHERE id = @id`,
    )
    .run({
      id,
      imagePath: patch.imagePath ?? current.image_path,
      question: patch.question ?? current.question,
      options: patch.options ? JSON.stringify(patch.options) : current.options,
      correctIndex: patch.correctIndex ?? current.correct_index,
      points: patch.points ?? current.points,
      active: patch.active === undefined ? current.active : patch.active ? 1 : 0,
    });

  return getAdminQuestion(id);
}

export function deleteQuestion(id: number): boolean {
  const info = getDb().prepare('DELETE FROM photo_questions WHERE id = ?').run(id);
  return info.changes > 0;
}

export interface CheckResult {
  correct: boolean;
  correctIndex: number;
  points: number;
}

/** Серверная проверка ответа. Возвращает null, если вопроса нет. */
export function checkAnswer(questionId: number, answerIndex: number): CheckResult | null {
  const row = getRow(questionId);
  if (!row) return null;
  const correct = row.correct_index === answerIndex;
  return {
    correct,
    correctIndex: row.correct_index,
    points: correct ? row.points : SCORING.photoQuiz.wrong,
  };
}
