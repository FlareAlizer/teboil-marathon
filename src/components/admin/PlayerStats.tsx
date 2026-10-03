'use client';

import { useCallback, useEffect, useState } from 'react';
import { ACTIVITY_LABELS, type ScoreEvent } from '@/lib/types';
import {
  RATINGS,
  RATING_IDS,
  formatRatingValue,
  ratingUnit,
} from '@/lib/rating-defs';
import { isSportActivity } from '@/lib/scoring';
import { displayName } from '@/lib/validation';
import { errorText } from './admin-api';
import { deleteScore, getPlayer, type PlayerCard } from './endpoints';
import { formatRawResult } from './activity-ui';
import { formatDayTime, formatTime, pluralRu, pointsLabel, signedPoints } from './format';

const ruDay = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

/**
 * Всё об одном участнике: баллы, места в рейтингах выбранного дня и полная
 * история — каждый ответ квиза с текстом вопроса, каждый результат станции,
 * ручные начисления. Ошибочную запись можно отменить (она уйдёт в архив).
 */
export function PlayerStats({
  id,
  day,
  onBack,
}: {
  id: number;
  day: string;
  onBack: () => void;
}) {
  const [card, setCard] = useState<PlayerCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setCard(await getPlayer(id, day));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [id, day]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(eventId: number) {
    try {
      await deleteScore(eventId);
      await load();
    } catch (e) {
      setError(errorText(e));
    }
  }

  const answers = card?.events.filter((e) => e.meta?.kind === 'answer') ?? [];
  const correct = answers.filter((e) => e.meta?.correct === true).length;

  // История по дням, свежие сверху.
  const byDay = new Map<string, ScoreEvent[]>();
  for (const e of card?.events ?? []) {
    // Местная дата, а не первые символы строки: время с сервера в UTC.
    const t = new Date(e.createdAt);
    const d = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    byDay.set(d, [...(byDay.get(d) ?? []), e]);
  }

  return (
    <div className="space-y-5 pt-1">
      <button
        type="button"
        onClick={onBack}
        className="min-h-tap font-display text-kiosk-sm font-black uppercase text-teboil-muted active:text-teboil-red"
      >
        ← К списку
      </button>

      {error && (
        <p role="alert" className="bg-teboil-red px-4 py-3 text-kiosk-sm font-bold text-white">
          {error}
        </p>
      )}

      {!card ? (
        <p className="py-6 text-center text-kiosk-sm text-teboil-muted">Загрузка…</p>
      ) : (
        <>
          <div className="border-2 border-teboil-blue bg-teboil-blue/5 p-4">
            <p className="break-all font-display text-kiosk-lg font-black leading-tight text-teboil-black">
              {displayName(card.nickname)}
            </p>
            <p className="text-kiosk-sm text-teboil-muted">
              впервые на стенде {formatDayTime(card.createdAt)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Tile value={card.todayPoints} label={`баллов за ${ruDay(day)}`} />
            <Tile value={card.totalPoints} label="баллов за все дни" />
          </div>

          <Section title={`Места в рейтингах за ${ruDay(day)}`}>
            <ul className="divide-y divide-teboil-line border-y border-teboil-line">
              {RATING_IDS.map((rid) => {
                const r = card.ratings?.[rid] ?? null;
                return (
                  <li key={rid} className="flex items-center gap-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-kiosk-sm font-bold leading-tight text-teboil-black">
                        {RATINGS[rid].title}
                      </span>
                      <span className="block text-[14px] text-teboil-muted">
                        {r ? `${formatRatingValue(rid, r.value)} ${ratingUnit(rid, r.value)}` : 'не участвовал'}
                      </span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-right font-display text-[15px] font-black text-teboil-blue">
                      {r ? `${r.rank} место из ${r.of}` : '—'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Section>

          {answers.length > 0 && (
            <p className="text-kiosk-sm text-teboil-muted">
              Квиз за все дни: {answers.length}{' '}
              {pluralRu(answers.length, 'ответ', 'ответа', 'ответов')}, верных {correct} (
              {Math.round((correct / answers.length) * 100)}%)
            </p>
          )}

          <Section title="История">
            {card.events.length === 0 ? (
              <p className="py-3 text-kiosk-sm text-teboil-muted">Записей нет — только входил.</p>
            ) : (
              <div className="space-y-5">
                {[...byDay.entries()].map(([d, events]) => (
                  <div key={d}>
                    <p className="mb-2 font-display text-kiosk-sm font-black text-teboil-blue">
                      {ruDay(d)} · {pointsLabel(events.reduce((s, e) => s + e.points, 0))}
                    </p>
                    <ul className="space-y-2">
                      {events.map((e) => (
                        <EventItem key={e.id} event={e} onRemove={remove} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

/** Одна запись истории в понятном виде — без номеров вопросов и вариантов. */
function EventItem({
  event,
  onRemove,
}: {
  event: ScoreEvent;
  onRemove: (id: number) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(t);
  }, [confirming]);

  const m = event.meta ?? {};
  let title = ACTIVITY_LABELS[event.activity] ?? event.activity;
  let detail: string | null = null;
  let mark: 'ok' | 'bad' | null = null;

  if (m.kind === 'answer') {
    title = typeof m.question === 'string' ? m.question : `Вопрос ${String(m.questionId)}`;
    detail = typeof m.answer === 'string' ? `Ответ: ${m.answer}` : null;
    if (m.correct === false && typeof m.correctAnswer === 'string') {
      detail += ` · верно: ${m.correctAnswer}`;
    }
    mark = m.correct === true ? 'ok' : 'bad';
  } else if (m.kind === 'bonus') {
    title = 'Бонус за все три уровня квиза';
  } else if (event.activity === 'sport_obstacle') {
    detail =
      typeof m.goal === 'boolean'
        ? m.goal
          ? `${formatRawResult('sport_obstacle', event.rawResult)}, гол`
          : `${formatRawResult('sport_obstacle', event.rawResult)} — мимо, ${String(m.timeSec).replace('.', ',')} + ${String(m.penaltySec)} с штрафа`
        : formatRawResult('sport_obstacle', event.rawResult);
  } else if (isSportActivity(event.activity)) {
    detail = formatRawResult(event.activity, event.rawResult);
  } else if (event.activity === 'manual' && typeof m.comment === 'string') {
    detail = m.comment;
  }

  return (
    <li className="flex items-start gap-3 border border-teboil-line bg-teboil-surface px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold leading-snug text-teboil-black">
          {mark && (
            <span className={mark === 'ok' ? 'text-teboil-green' : 'text-teboil-red'}>
              {mark === 'ok' ? '✓ ' : '✗ '}
            </span>
          )}
          {title}
        </p>
        {detail && <p className="text-[14px] leading-snug text-teboil-muted">{detail}</p>}
        <p className="text-[13px] text-teboil-muted">
          {formatTime(event.createdAt)} · {event.createdBy === 'admin' ? 'волонтёр' : 'автоматически'}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span
          className={`font-display text-kiosk-base font-black tabular-nums ${
            event.points < 0 ? 'text-teboil-red' : 'text-teboil-black'
          }`}
        >
          {signedPoints(event.points)}
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (!confirming) return setConfirming(true);
            setBusy(true);
            await onRemove(event.id);
            setBusy(false);
            setConfirming(false);
          }}
          className={`min-h-[36px] px-2 text-[12px] font-black uppercase disabled:opacity-40 ${
            confirming ? 'bg-teboil-red text-white' : 'text-teboil-muted underline'
          }`}
        >
          {busy ? '…' : confirming ? 'Точно?' : 'Отменить'}
        </button>
      </div>
    </li>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 font-display text-kiosk-sm font-black uppercase tracking-wide text-teboil-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <div className="border-2 border-teboil-line p-3 text-center">
      <p className="font-display text-[2.2rem] font-black leading-none text-teboil-black">{value}</p>
      <p className="mt-1 text-[13px] font-bold uppercase leading-tight text-teboil-muted">{label}</p>
    </div>
  );
}
