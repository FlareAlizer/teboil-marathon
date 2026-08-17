import { handle, jsonError, jsonOk } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { addScoreEvent, deleteScoreEvent, findPlayerById } from '@/lib/queries';
import { SCORING } from '@/lib/scoring';
import {
  parseActivity,
  parseCreatedBy,
  parseId,
  parseInt_,
  parseMeta,
  parseOptionalText,
  readJson,
} from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/score — начисление баллов.
 * Тело: { playerId, activity, points, rawResult?, meta?, createdBy }
 * createdBy = 'admin' требует активной сессии оператора.
 * Ответ: { event, totalPoints, todayPoints }
 */
export function POST(request: Request) {
  return handle(async () => {
    const body = await readJson(request);

    const playerId = parseId(body.playerId, 'playerId');
    const activity = parseActivity(body.activity);
    const points = parseInt_(body.points, 'points', -SCORING.manual.max, SCORING.manual.max);
    const rawResult = parseOptionalText(body.rawResult, 'rawResult', 200);
    const meta = parseMeta(body.meta);
    const createdBy = parseCreatedBy(body.createdBy);

    if (createdBy === 'admin') await requireAdmin();

    if (!findPlayerById(playerId)) return jsonError('Участник не найден', 404);

    const result = addScoreEvent({
      playerId,
      activity,
      points,
      rawResult,
      meta,
      createdBy,
    });

    return jsonOk(result, 201);
  });
}

/**
 * DELETE /api/score?id=... — отмена ошибочного начисления оператором.
 * Только с активной сессией: иначе участник мог бы стереть чужие баллы.
 * Ответ: { deleted, playerId, points, totalPoints, todayPoints }
 */
export function DELETE(request: Request) {
  return handle(async () => {
    await requireAdmin();

    const url = new URL(request.url);
    const id = parseId(url.searchParams.get('id'), 'id');

    const result = deleteScoreEvent(id);
    if (!result) return jsonError('Начисление не найдено', 404);

    return jsonOk(result);
  });
}
