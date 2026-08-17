import { handle, jsonError, jsonOk } from '@/lib/api';
import { checkAnswer } from '@/lib/photo-questions';
import {
  addScoreEvent,
  findPlayerById,
  getActivityEventsToday,
  getTotalPoints,
} from '@/lib/queries';
import { todayLocal } from '@/lib/db';
import { parseId, parseInt_, readJson } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/photo-questions/check — проверка ответа фото-квиза НА СЕРВЕРЕ.
 * Тело: { questionId, answerIndex, playerId }
 * Ответ: { correct, correctIndex, points, awarded, totalPoints, todayPoints }
 *
 * Правильный ответ уходит клиенту только вместе с результатом проверки.
 * Повторный ответ на тот же вопрос за день баллов не приносит.
 */
export function POST(request: Request) {
  return handle(async () => {
    const body = await readJson(request);
    const questionId = parseId(body.questionId, 'questionId');
    const playerId = parseId(body.playerId, 'playerId');
    const answerIndex = parseInt_(body.answerIndex, 'answerIndex', 0, 3);

    if (!findPlayerById(playerId)) return jsonError('Участник не найден', 404);

    const result = checkAnswer(questionId, answerIndex);
    if (!result) return jsonError('Вопрос не найден', 404);

    const alreadyAnswered = getActivityEventsToday(playerId, 'photo_quiz').some(
      (e) => e.meta?.questionId === questionId,
    );

    let totalPoints = 0;
    let todayPoints = 0;
    let awarded = false;

    if (!alreadyAnswered) {
      const saved = addScoreEvent({
        playerId,
        activity: 'photo_quiz',
        points: result.points,
        rawResult: String(answerIndex),
        meta: { questionId, answerIndex, correct: result.correct },
        createdBy: 'auto',
      });
      totalPoints = saved.totalPoints;
      todayPoints = saved.todayPoints;
      awarded = result.points > 0;
    } else {
      totalPoints = getTotalPoints(playerId);
      todayPoints = getTotalPoints(playerId, todayLocal());
    }

    return jsonOk({
      correct: result.correct,
      correctIndex: result.correctIndex,
      points: alreadyAnswered ? 0 : result.points,
      awarded,
      alreadyAnswered,
      totalPoints,
      todayPoints,
    });
  });
}
