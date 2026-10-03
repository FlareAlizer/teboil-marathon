import { handle, jsonError, jsonOk } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { addScoreEvent, deleteScoreEvent, findPlayerById } from '@/lib/queries';
import { SCORING } from '@/lib/scoring';
import {
  parseActivity,
  parseId,
  parseInt_,
  parseMeta,
  parseOptionalText,
  parseSportEntry,
  readJson,
} from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/score — начисление оператором или волонтёром станции.
 * Тело: { playerId, activity, points, rawResult?, meta? }
 * Ответ: { event, totalPoints, todayPoints }
 *
 * Только с сессией оператора, всегда. Раньше начисление с `createdBy: 'auto'`
 * проходило без входа — тогда это ничего не открывало, но теперь по
 * результатам станций строятся рейтинги с призами, и любой мог бы поставить
 * себе 999 очков в дартс одним запросом. Сама игра сюда не ходит: баллы за
 * квиз начисляет /api/quiz/answer.
 *
 * Результаты чеканки, дартса и полосы проверяются на сервере, итоговое
 * время полосы (со штрафом за промах) считается тоже здесь — см.
 * parseSportEntry.
 */
export function POST(request: Request) {
  return handle(async () => {
    await requireAdmin();

    const body = await readJson(request);

    const playerId = parseId(body.playerId, 'playerId');
    const activity = parseActivity(body.activity);
    const points = parseInt_(body.points, 'points', -SCORING.manual.max, SCORING.manual.max);
    const entry = parseSportEntry(
      activity,
      parseOptionalText(body.rawResult, 'rawResult', 200),
      parseMeta(body.meta),
    );

    if (!await findPlayerById(playerId)) return jsonError('Участник не найден', 404);

    const result = await addScoreEvent({
      playerId,
      activity,
      points,
      rawResult: entry.rawResult,
      meta: entry.meta,
      createdBy: 'admin',
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

    const result = await deleteScoreEvent(id);
    if (!result) return jsonError('Начисление не найдено', 404);

    return jsonOk(result);
  });
}
