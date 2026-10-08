import { requireAdmin } from '@/lib/auth';
import { todayLocal } from '@/lib/db';
import { logEvent } from '@/lib/log';
import { getDayEvents, type DayEventRow } from '@/lib/stats';
import { ACTIVITY_LABELS, type Activity } from '@/lib/types';
import { ValidationError, displayName, parseDay } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/export?day=YYYY-MM-DD — выгрузка результатов дня для Excel.
 *
 * Структура: строка на участника, колонка на активность, сумма справа —
 * как в согласованном с заказчиком макете таблицы.
 *
 * Отдаём CSV с точкой с запятой и BOM: именно так Excel в русской локали
 * открывает файл двойным кликом, сразу с колонками и без кракозябр.
 */

/**
 * Порядок колонок: сначала автоматические квизы, затем то, что заводит
 * оператор. Тип гарантирует, что здесь перечислены ВСЕ активности: пропусти
 * одну — и сумма по колонкам разошлась бы с итогом, а разбираться с этим
 * пришлось бы уже над готовым отчётом заказчика.
 */
const COLUMNS = [
  'quiz_roulette_v1',
  'quiz_roulette_v2',
  'sport_keepups',
  'sport_obstacle',
  'sport_goal',
  'sport_darts',
  'manual',
] as const satisfies readonly Activity[];

type ListedActivity = (typeof COLUMNS)[number];
/** Ошибка компиляции, если в types.ts добавили активность, а сюда — нет. */
const _allActivitiesListed: ListedActivity extends Activity
  ? Activity extends ListedActivity
    ? true
    : never
  : never = true;
void _allActivitiesListed;

function isAuto(activity: Activity): boolean {
  return activity.startsWith('quiz_');
}

/**
 * Заголовок колонки. Пометку «автоматическое / ручное заполнение» ставим
 * только на первой колонке каждого вида — как в макете заказчика: она
 * поясняет весь блок, а на каждой колонке превратилась бы в шум.
 */
function columnTitle(activity: Activity, index: number): string {
  const first = index === 0 || isAuto(COLUMNS[index - 1]) !== isAuto(activity);
  if (!first) return ACTIVITY_LABELS[activity];
  return `${ACTIVITY_LABELS[activity]} (${isAuto(activity) ? 'автоматическое' : 'ручное'} заполнение)`;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function json(status: number, error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface PlayerTotals {
  nickname: string;
  total: number;
  firstAt: string;
  byActivity: Map<Activity, number>;
  events: DayEventRow[];
}

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdmin();
  } catch {
    return json(401, 'Нужен вход оператора');
  }

  let day: string;
  try {
    day = parseDay(new URL(request.url).searchParams.get('day'), todayLocal());
  } catch (e) {
    return json(400, e instanceof ValidationError ? e.message : 'Некорректный день');
  }

  try {
    const events = await getDayEvents(day);

    // Сводка по участникам. События идут по времени, поэтому первое событие
    // участника — это и есть время его старта (для равенства баллов).
    const players = new Map<number, PlayerTotals>();
    for (const event of events) {
      let p = players.get(event.playerId);
      if (!p) {
        p = { nickname: event.nickname, total: 0, firstAt: event.createdAt, byActivity: new Map(), events: [] };
        players.set(event.playerId, p);
      }
      p.total += event.points;
      p.byActivity.set(event.activity, (p.byActivity.get(event.activity) ?? 0) + event.points);
      p.events.push(event);
    }

    // Порядок как у лидерборда: больше баллов — выше, при равенстве — кто раньше начал.
    const rows = [...players.values()].sort(
      (a, b) => b.total - a.total || a.firstAt.localeCompare(b.firstAt),
    );

    const header = ['Имя пользователя', ...COLUMNS.map((a, i) => columnTitle(a, i)), 'Сумма баллов'];
    const lines = [header.map(csvCell).join(';')];

    for (const row of rows) {
      lines.push(
        [
          // Апостроф не даёт Excel съесть ведущий «@» и превратить ячейку в формулу.
          `'${displayName(row.nickname)}`,
          ...COLUMNS.map((a) => row.byActivity.get(a) ?? 0),
          row.total,
        ]
          .map(csvCell)
          .join(';'),
      );
    }

    if (rows.length === 0) {
      lines.push(['За этот день ещё никто не играл', ...COLUMNS.map(() => 0), 0].join(';'));
    }

    /* Второй блок — детализация: из сводной таблицы не видно, что именно
       показал участник на станции, а при споре о призе это первое, что спросят. */
    lines.push('');
    lines.push(
      ['Имя пользователя', 'Активность', 'Результат', 'Баллы', 'Время', 'Кем начислено']
        .map(csvCell)
        .join(';'),
    );

    for (const row of rows) {
      for (const event of row.events) {
        lines.push(
          [
            `'${displayName(row.nickname)}`,
            ACTIVITY_LABELS[event.activity] ?? event.activity,
            event.rawResult ?? '',
            event.points,
            event.createdAt,
            event.createdBy === 'admin' ? 'оператор' : 'автоматически',
          ]
            .map(csvCell)
            .join(';'),
        );
      }
    }

    void logEvent('export', { day, players: rows.length, events: events.length });

    const csv = `﻿${lines.join('\r\n')}\r\n`;
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="teboil-${day}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    void logEvent('api_error', { status: 500, error: err.message, where: 'export', day }, 'error');
    return json(500, 'Не удалось собрать выгрузку, попробуй ещё раз');
  }
}
