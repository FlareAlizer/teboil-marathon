import { handle, jsonError, jsonOk } from '@/lib/api';
import { findQuizQuestion, isQuizVariant, quizActivity } from '@/lib/quiz';
import { quizAnswerPoints } from '@/lib/scoring';
import { addScoreEvent, findPlayerById, getActivityEventsToday } from '@/lib/queries';
import { parseBool, parseId, parseInt_, readJson } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/quiz/answer — проверка ответа квиза НА СЕРВЕРЕ и начисление баллов.
 * Тело: { playerId, variant: 'v1'|'v2', questionId, answerIndex, bet?: boolean }
 * Ответ: { correct, correctIndex, fact, level, points, betApplied, prizesLost,
 *          totalPoints, todayPoints, alreadyAnswered }
 *
 * `fact` — пояснение/брендовый факт Teboil. Уходит только здесь, вместе с
 * правильным ответом, поэтому не подсказывает ответ заранее.
 *
 * Ставка возможна только с уровня 2. Проигранная ставка сжигает ПРИЗЫ,
 * но уже набранные баллы остаются — за неверный ответ просто ничего не начисляем.
 */
export function POST(request: Request) {
  return handle(async () => {
    const body = await readJson(request);

    const playerId = parseId(body.playerId, 'playerId');
    const variant = body.variant ?? 'v1';
    if (!isQuizVariant(variant)) return jsonError('variant: ожидается v1 или v2', 400);

    const questionId =
      typeof body.questionId === 'string' ? body.questionId.trim() : '';
    if (!questionId) return jsonError('questionId обязателен', 400);

    const bet = parseBool(body.bet, false);

    if (!findPlayerById(playerId)) return jsonError('Участник не найден', 404);

    const question = findQuizQuestion(variant, questionId);
    if (!question) return jsonError('Вопрос не найден', 404);

    const maxIndex = Math.max(0, question.optionsCount - 1);
    const answerIndex = parseInt_(body.answerIndex, 'answerIndex', 0, maxIndex);

    const activity = quizActivity(variant);
    const answeredEvents = getActivityEventsToday(playerId, activity);
    const alreadyAnswered = answeredEvents.some(
      (e) => e.meta?.questionId === questionId,
    );

    const correct = question.correctIndex === answerIndex;
    const outcome = quizAnswerPoints(question.level, correct, bet);

    if (alreadyAnswered) {
      return jsonOk({
        correct,
        correctIndex: question.correctIndex,
        fact: question.fact,
        level: question.level,
        points: 0,
        betApplied: outcome.betApplied,
        prizesLost: outcome.prizesLost,
        alreadyAnswered: true,
        totalPoints: null,
        todayPoints: null,
      });
    }

    const saved = addScoreEvent({
      playerId,
      activity,
      points: outcome.points,
      rawResult: String(answerIndex),
      meta: {
        questionId,
        level: question.level,
        answerIndex,
        correct,
        bet: outcome.betApplied,
        kind: 'answer',
      },
      createdBy: 'auto',
    });

    return jsonOk({
      correct,
      correctIndex: question.correctIndex,
      fact: question.fact,
      level: question.level,
      points: outcome.points,
      betApplied: outcome.betApplied,
      prizesLost: outcome.prizesLost,
      alreadyAnswered: false,
      totalPoints: saved.totalPoints,
      todayPoints: saved.todayPoints,
    });
  });
}
