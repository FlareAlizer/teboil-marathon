export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/trace?e=tg_click — отметка шага на телефоне участника.
 *
 * Ничего не хранит и не считает: сам запрос попадает в журнал nginx, и по
 * нему видно, где люди застревают при входе. Без этих отметок сервер видит
 * только «страницу отдали» — а запустилось ли на ней приложение, нажал ли
 * человек кнопку Telegram и открылся ли Telegram, из журнала понять нельзя
 * (переход на t.me — это запрос телефона к чужому сайту).
 *
 * Личных данных в отметках нет: только название шага.
 */
export function GET(): Response {
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
