export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/trace?e=start_new — отметка шага на телефоне участника.
 *
 * Ничего не хранит и не считает: сам запрос попадает в журнал nginx, и по
 * нему видно, где люди застревают. Без этих отметок сервер видит только
 * «страницу отдали» — а запустилось ли на ней приложение и не упало ли оно,
 * из журнала понять нельзя.
 *
 * Личных данных в отметках нет: только название шага.
 */
export function GET(): Response {
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
