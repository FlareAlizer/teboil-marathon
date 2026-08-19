import { handle, jsonError, jsonOk } from '@/lib/api';
import { isQuizVariant, quizActivity } from '@/lib/quiz';
import { quizCompletionBonus } from '@/lib/scoring';
import {
  addScoreEvent,
  findPlayerById,
  getActivityEventsToday,
  getTotalPoints,
} from '@/lib/queries';
import { todayLocal } from '@/lib/db';
import { parseId, readJson } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/quiz/complete — бонус за прохождение всех трёх уровней (+40).
 * Тело: { playerId, variant }
 * Сервер сам проверяет по журналу, что все три уровня пройдены верно
 * и что бонус ещё не выдавался. Клиент бонус начислить не может.
 * Ответ: { awarded, bonus, levelsPassed, totalPoints, todayPoints }
 */
export function POST(request: Request) {
  return handle(async () => {
    const body = await readJson(request);
    const playerId = parseId(body.playerId, 'playerId');
    const variant = body.variant ?? 'v1';
    if (!isQuizVariant(variant)) return jsonError('variant: ожидается v1 или v2', 400);

    if (!await findPlayerById(playerId)) return jsonError('Участник не найден', 404);

    const activity = quizActivity(variant);
    const events = await getActivityEventsToday(playerId, activity);

    const bonusAlreadyGiven = events.some((e) => e.meta?.kind === 'bonus');
    const levelsPassed = [
      ...new Set(
        events
          .filter((e) => e.meta?.kind === 'answer' && e.meta?.correct === true)
          .map((e) => Number(e.meta?.level)),
      ),
    ].filter((l): l is number => l === 1 || l === 2 || l === 3);

    const allPassed = [1, 2, 3].every((l) => levelsPassed.includes(l));

    if (bonusAlreadyGiven || !allPassed) {
      return jsonOk({
        awarded: false,
        bonus: 0,
        levelsPassed: levelsPassed.sort(),
        alreadyAwarded: bonusAlreadyGiven,
        totalPoints: await getTotalPoints(playerId),
        todayPoints: await getTotalPoints(playerId, todayLocal()),
      });
    }

    const bonus = quizCompletionBonus();
    const saved = await addScoreEvent({
      playerId,
      activity,
      points: bonus,
      rawResult: 'all_levels',
      meta: { kind: 'bonus', variant },
      createdBy: 'auto',
    });

    return jsonOk({
      awarded: true,
      bonus,
      levelsPassed: [1, 2, 3],
      alreadyAwarded: false,
      totalPoints: saved.totalPoints,
      todayPoints: saved.todayPoints,
    });
  });
}
