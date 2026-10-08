import { handle, jsonError, jsonOk } from '@/lib/api';
import { getPublicQuiz, isQuizVariant, quizActivity } from '@/lib/quiz';
import { SCORING } from '@/lib/scoring';
import { getAnsweredQuestionIds } from '@/lib/queries';
import { logEvent } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/quiz?variant=v1&playerId=7 — вопросы квиза с рулеткой БЕЗ правильных ответов.
 * Ответ: { variant, title, levels: [{ level, title, questions: [{id, question, options}] }],
 *          rules: { levelPoints, allLevelsBonus, betFromLevel, betMultiplier },
 *          answeredIds: string[] }
 *
 * `answeredIds` — вопросы, на которые участник уже отвечал (в любой день).
 * Нужны, чтобы при повторном заходе квиз начинался с других вопросов: за
 * повторный ответ сервер не начислит баллы и назавтра (уникальный индекс в
 * db.ts не знает дня) и вернёт прежний итог, а показывать такой вопрос
 * значило бы обманывать участника.
 *
 * `playerId` необязателен: без него отдаётся тот же квиз с пустым списком.
 */
export function GET(request: Request) {
  return handle(async () => {
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

    const answeredIds = await answeredBefore(url.searchParams.get('playerId'), variant);
    void logEvent('quiz_load', {
      variant,
      player: Number(url.searchParams.get('playerId')) || undefined,
      answered: answeredIds.length,
    });

    return jsonOk({ ...quiz, rules: SCORING.quiz, answeredIds });
  });
}

/**
 * Id вопросов, на которые участник уже отвечал. Кривой или чужой `playerId`
 * не ошибка: квиз должен открыться в любом случае, просто без истории.
 */
async function answeredBefore(
  rawPlayerId: string | null,
  variant: 'v1' | 'v2',
): Promise<string[]> {
  const playerId = Number(rawPlayerId);
  if (!Number.isInteger(playerId) || playerId <= 0) return [];
  return getAnsweredQuestionIds(playerId, quizActivity(variant));
}
