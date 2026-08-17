import { handle, jsonError, jsonOk } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import {
  createQuestion,
  deleteQuestion,
  listAdminQuestions,
  listPublicQuestions,
  updateQuestion,
} from '@/lib/photo-questions';
import { SCORING } from '@/lib/scoring';
import {
  parseBool,
  parseId,
  parseInt_,
  parseOptions,
  parseText,
  readJson,
} from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/photo-questions            — активные вопросы БЕЗ correctIndex (участнику).
 * GET /api/photo-questions?admin=1    — все вопросы с correctIndex (нужна сессия оператора).
 */
export function GET(request: Request) {
  return handle(async () => {
    const url = new URL(request.url);
    if (url.searchParams.get('admin') === '1') {
      await requireAdmin();
      return jsonOk({ questions: listAdminQuestions() });
    }
    return jsonOk({ questions: listPublicQuestions() });
  });
}

/** POST /api/photo-questions — создать вопрос. Нужна сессия оператора. */
export function POST(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const body = await readJson(request);

    const question = createQuestion({
      imagePath: parseText(body.imagePath, 'imagePath', { max: 300 }),
      question: parseText(body.question, 'question', { max: 300 }),
      options: parseOptions(body.options),
      correctIndex: parseInt_(body.correctIndex, 'correctIndex', 0, 3),
      points:
        body.points === undefined
          ? SCORING.photoQuiz.correct
          : parseInt_(body.points, 'points', 0, SCORING.manual.max),
      active: parseBool(body.active, true),
    });

    return jsonOk({ question }, 201);
  });
}

/** PUT /api/photo-questions — изменить вопрос. Нужна сессия оператора. */
export function PUT(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const body = await readJson(request);
    const id = parseId(body.id, 'id вопроса');

    const patch: Parameters<typeof updateQuestion>[1] = {};
    if (body.imagePath !== undefined) {
      patch.imagePath = parseText(body.imagePath, 'imagePath', { max: 300 });
    }
    if (body.question !== undefined) {
      patch.question = parseText(body.question, 'question', { max: 300 });
    }
    if (body.options !== undefined) patch.options = parseOptions(body.options);
    if (body.correctIndex !== undefined) {
      patch.correctIndex = parseInt_(body.correctIndex, 'correctIndex', 0, 3);
    }
    if (body.points !== undefined) {
      patch.points = parseInt_(body.points, 'points', 0, SCORING.manual.max);
    }
    if (body.active !== undefined) patch.active = parseBool(body.active, true);

    const question = updateQuestion(id, patch);
    if (!question) return jsonError('Вопрос не найден', 404);
    return jsonOk({ question });
  });
}

/** DELETE /api/photo-questions?id=  — удалить вопрос. Нужна сессия оператора. */
export function DELETE(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const url = new URL(request.url);
    const fromQuery = url.searchParams.get('id');
    const id = parseId(fromQuery ?? (await readJson(request)).id, 'id вопроса');

    if (!deleteQuestion(id)) return jsonError('Вопрос не найден', 404);
    return jsonOk({ deleted: id });
  });
}
