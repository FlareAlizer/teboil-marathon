import { handle, jsonError, jsonOk } from '@/lib/api';
import { getPublicQuiz, isQuizVariant } from '@/lib/quiz';
import { SCORING } from '@/lib/scoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/quiz?variant=v1 — вопросы квиза с рулеткой БЕЗ правильных ответов.
 * Ответ: { variant, title, levels: [{ level, title, questions: [{id, question, options}] }],
 *          rules: { levelPoints, allLevelsBonus, betFromLevel, betMultiplier } }
 */
export function GET(request: Request) {
  return handle(() => {
    const url = new URL(request.url);
    const variant = url.searchParams.get('variant') ?? 'v1';
    if (!isQuizVariant(variant)) return jsonError('variant: ожидается v1 или v2', 400);

    const quiz = getPublicQuiz(variant);
    if (!quiz) {
      return jsonError(
        `Вопросы для варианта ${variant} не найдены — проверьте src/data/quiz.json`,
        503,
      );
    }

    return jsonOk({ ...quiz, rules: SCORING.quiz });
  });
}
