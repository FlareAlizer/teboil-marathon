import { handle, jsonError, jsonOk } from '@/lib/api';
import { getPublicQuiz, isQuizVariant, quizActivity } from '@/lib/quiz';
import { SCORING } from '@/lib/scoring';
import { getActivityEventsToday } from '@/lib/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/quiz?variant=v1&playerId=7 — вопросы квиза с рулеткой БЕЗ правильных ответов.
 * Ответ: { variant, title, levels: [{ level, title, questions: [{id, question, options}] }],
 *          rules: { levelPoints, allLevelsBonus, betFromLevel, betMultiplier },
 *          answeredIds: string[] }
 *
 * `answeredIds` — вопросы, на которые участник уже отвечал сегодня. Нужны,
 * чтобы при повторном заходе квиз начинался с других вопросов: за повторный
 * ответ сервер всё равно не начислит баллы (см. уникальный индекс в db.ts),
 * и показывать такой вопрос значило бы обманывать участника.
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

    return jsonOk({
      ...quiz,
      rules: SCORING.quiz,
      answeredIds: await answeredToday(url.searchParams.get('playerId'), variant),
    });
  });
}

/**
 * Id вопросов, отвеченных участником сегодня. Кривой или чужой `playerId`
 * не ошибка: квиз должен открыться в любом случае, просто без истории.
 */
async function answeredToday(
  rawPlayerId: string | null,
  variant: 'v1' | 'v2',
): Promise<string[]> {
  const playerId = Number(rawPlayerId);
  if (!Number.isInteger(playerId) || playerId <= 0) return [];

  const events = await getActivityEventsToday(playerId, quizActivity(variant));
  const ids = events
    .filter((event) => event.meta?.kind === 'answer')
    .map((event) => event.meta?.questionId)
    .filter((id): id is string => typeof id === 'string');

  return [...new Set(ids)];
}
