'use client';

import { useEffect, useState } from 'react';
import { formatRatingValue, type RatingBoard, type StationEntry } from '@/lib/rating-defs';
import { displayName } from '@/lib/validation';
import { formatTime, truncateNickname } from '../format';
import type { StationId } from './station-config';

/**
 * Рейтинг станции и последние записи — нижняя часть экрана волонтёра.
 *
 * Рейтинг здесь затем, чтобы волонтёр мог сразу ответить на вопрос
 * «а какое я место?», не отправляя человека к телевизору. Записи — чтобы
 * опечатку можно было отменить сразу, пока участник ещё рядом.
 */
export function StationBoard({
  station,
  board,
  entries,
  onUndo,
}: {
  station: StationId;
  board: RatingBoard | null;
  entries: StationEntry[];
  onUndo: (entry: StationEntry) => Promise<void>;
}) {
  return (
    <div className="space-y-8">
      <section>
        <Heading>Рейтинг станции</Heading>
        {!board || board.rows.length === 0 ? (
          <Empty>Сегодня ещё никто не выступал</Empty>
        ) : (
          <ol className="space-y-1">
            {board.rows.map((row) => (
              <li
                key={row.id}
                className={`flex items-center gap-3 px-3 py-2 ${
                  row.rank === 1 ? 'bg-teboil-red text-white' : 'bg-teboil-surface text-teboil-black'
                }`}
              >
                <span className="w-7 shrink-0 text-center font-display text-kiosk-sm font-black tabular-nums">
                  {row.rank}
                </span>
                <span className="min-w-0 flex-1 truncate font-display text-kiosk-sm font-bold">
                  {truncateNickname(displayName(row.nickname), 22)}
                </span>
                <span className="shrink-0 font-display text-kiosk-base font-black tabular-nums">
                  {formatRatingValue(station, row.value)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <Heading>Последние записи</Heading>
        {entries.length === 0 ? (
          <Empty>Записей пока нет</Empty>
        ) : (
          <ul className="divide-y divide-teboil-line border-y border-teboil-line">
            {entries.map((entry) => (
              <EntryRow key={entry.eventId} station={station} entry={entry} onUndo={onUndo} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Строка записи с отменой в два касания: первое касание только спрашивает
 * «Точно?», и через несколько секунд кнопка возвращается в исходное
 * состояние. Случайный тап большим пальцем ничего не сотрёт.
 */
function EntryRow({
  station,
  entry,
  onUndo,
}: {
  station: StationId;
  entry: StationEntry;
  onUndo: (entry: StationEntry) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(t);
  }, [confirming]);

  const value = entry.value === null ? '—' : formatRatingValue(station, entry.value);
  const detail =
    station === 'obstacle' && entry.timeSec !== null && entry.goal !== null
      ? entry.goal
        ? 'гол'
        : `мимо, ${formatRatingValue('obstacle', entry.timeSec)} + штраф`
      : null;

  return (
    <li className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-kiosk-sm font-bold text-teboil-black">
          {truncateNickname(displayName(entry.nickname), 22)}
        </p>
        <p className="text-[14px] text-teboil-muted">
          {formatTime(entry.createdAt)}
          {detail && ` · ${detail}`}
        </p>
      </div>
      <span className="shrink-0 font-display text-kiosk-base font-black tabular-nums text-teboil-blue">
        {value}
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (!confirming) {
            setConfirming(true);
            return;
          }
          setBusy(true);
          try {
            await onUndo(entry);
          } finally {
            setBusy(false);
            setConfirming(false);
          }
        }}
        className={`min-h-tap shrink-0 px-3 font-display text-[14px] font-black uppercase transition-colors disabled:opacity-40 ${
          confirming ? 'bg-teboil-red text-white' : 'border-2 border-teboil-line text-teboil-muted active:bg-teboil-surface'
        }`}
      >
        {busy ? '…' : confirming ? 'Точно?' : 'Отменить'}
      </button>
    </li>
  );
}

function Heading({ children }: { children: string }) {
  return (
    <h2 className="mb-3 font-display text-kiosk-sm font-black uppercase tracking-wide text-teboil-muted">
      {children}
    </h2>
  );
}

function Empty({ children }: { children: string }) {
  return <p className="py-3 text-kiosk-sm text-teboil-muted">{children}</p>;
}
