import { handle, jsonError, jsonOk } from '@/lib/api';
import { findQuizQuestion, isQuizVariant, quizActivity } from '@/lib/quiz';
import { quizAnswerPoints } from '@/lib/scoring';
import {
  addScoreEvent,
  findPlayerById,
  getActivityEventsToday,
  getTotalPoints,
} from '@/lib/queries';
import { todayLocal } from '@/lib/db';
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
 * За неверный ответ снимается половина цены уровня (−5 / −10 / −15): ошибка
 * больше не заканчивает игру, поэтому у неё должна быть цена, иначе выгодно
 * тыкать наугад. Итог дня при этом никогда не уходит в минус — см. capPenalty.
 *
 * Ставка возможна только с уровня 2 и сжигает ПРИЗЫ при проигрыше. В текущем
 * потоке она не предлагается: клиент всегда шлёт bet: false.
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

    if (!await findPlayerById(playerId)) return jsonError('Участник не найден', 404);

    const question = findQuizQuestion(variant, questionId);
    if (!question) return jsonError('Вопрос не найден', 404);

    const maxIndex = Math.max(0, question.optionsCount - 1);
    const answerIndex = parseInt_(body.answerIndex, 'answerIndex', 0, maxIndex);

    const activity = quizActivity(variant);
    const answeredEvents = await getActivityEventsToday(playerId, activity);
    /**
     * Ответ на уже отвеченный вопрос: возвращаем ТОТ ЖЕ итог, что был засчитан
     * в первый раз, и ничего не начисляем. Телефон, который из-за обрыва связи
     * не дождался ответа, просто спрашивает ещё раз и показывает участнику
     * настоящий результат — а подобрать верный вариант повтором нельзя.
     */
    const repeatOf = async (event: { points: number; meta: Record<string, unknown> | null }) =>
      jsonOk({
        correct: event.meta?.correct === true,
        correctIndex: question.correctIndex,
        fact: question.fact,
        level: question.level,
        points: event.points,
        betApplied: false,
        prizesLost: false,
        alreadyAnswered: true,
        totalPoints: await getTotalPoints(playerId),
        todayPoints: await getTotalPoints(playerId, todayLocal()),
      });

    const previous = answeredEvents.find((e) => e.meta?.questionId === questionId);
    if (previous) return repeatOf(previous);

    const correct = question.correctIndex === answerIndex;
    const outcome = quizAnswerPoints(question.level, correct, bet);

    const points = await capPenalty(playerId, outcome.points);

    const saved = await addScoreEvent({
      playerId,
      activity,
      points,
      rawResult: String(answerIndex),
      // Тексты сохраняем вместе с номерами: банк вопросов могут поправить,
      // и тогда по одному questionId уже нельзя будет понять, что спрашивали
      // и что человек ответил. Журнал должен читаться и через год.
      meta: {
        questionId,
        variant,
        theme: question.theme,
        question: question.question,
        level: question.level,
        answerIndex,
        answer: question.options[answerIndex] ?? null,
        correctAnswer: question.options[question.correctIndex] ?? null,
        correct,
        bet: outcome.betApplied,
        kind: 'answer',
      },
      createdBy: 'auto',
    });

    // Вопрос уже был отвечен (в другой день или параллельным запросом) —
    // база вторую запись не приняла, отдаём прежний итог.
    if (saved.duplicate) return repeatOf(saved.event);

    return jsonOk({
      correct,
      correctIndex: question.correctIndex,
      fact: question.fact,
      level: question.level,
      points,
      betApplied: outcome.betApplied,
      prizesLost: outcome.prizesLost,
      alreadyAnswered: false,
      totalPoints: saved.totalPoints,
      todayPoints: saved.todayPoints,
    });
  });
}

/**
 * Штраф не может увести итог дня в минус: отрицательные числа на лидерборде
 * и в выгрузке выглядят как сбой, а участнику, который только начал, нечего
 * терять. Списываем не больше, чем набрано за сегодня.
 *
 * Два одновременных ответа одного участника теоретически могут в сумме
 * перескочить ноль, но планшет у человека один, и блокировать ради этого
 * строку в базе смысла нет.
 */
async function capPenalty(playerId: number, points: number): Promise<number> {
  if (points >= 0) return points;
  const today = await getTotalPoints(playerId, todayLocal());
  return Math.max(points, -Math.max(today, 0));
}
