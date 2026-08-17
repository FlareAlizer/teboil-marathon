'use client';

import { useCallback, useEffect, useState } from 'react';
import { ACTIVITY_LABELS, type PlayerSummary, type ScoreEvent } from '@/lib/types';
import { isSportActivity } from '@/lib/scoring';
import { displayName } from '@/lib/validation';
import { errorText } from './admin-api';
import { deleteScore, getPlayer, searchPlayers, type PlayerCard } from './endpoints';
import { formatRawResult } from './activity-ui';
import { formatTime, pointsLabel, signedPoints } from './format';

/**
 * Список участников за день и карточка игрока с историей начислений.
 *
 * Отмена начисления — обязательная часть: оператор ошибается в спешке,
 * и без неё единственным способом исправить баллы была бы правка базы
 * прямо во время мероприятия.
 */
export function PlayersTab() {
  const [rows, setRows] = useState<PlayerSummary[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await searchPlayers('', 200));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (openId !== null) {
    return (
      <PlayerDetails
        id={openId}
        onBack={() => {
          setOpenId(null);
          void reload();
        }}
      />
    );
  }

  return (
    <div className="space-y-4 pt-1">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-kiosk-sm font-black uppercase tracking-wide text-teboil-muted">
          Участники сегодня
        </h2>
        <button
          type="button"
          onClick={() => void reload()}
          className="min-h-tap px-2 font-display text-kiosk-sm font-black uppercase text-teboil-muted active:text-teboil-red"
        >
          Обновить
        </button>
      </div>

      {error && (
        <p className="text-kiosk-sm font-bold text-teboil-red" role="alert">
          {error}
        </p>
      )}

      {loading && rows.length === 0 && (
        <p className="py-6 text-center text-kiosk-sm text-teboil-muted">Загрузка…</p>
      )}

      {!loading && rows.length === 0 && !error && (
        <p className="py-6 text-center text-kiosk-sm text-teboil-muted">
          Сегодня ещё никто не заходил.
        </p>
      )}

      <ul className="space-y-2">
        {rows.map((p, i) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => setOpenId(p.id)}
              className="flex min-h-tap-lg w-full items-center gap-3 rounded-btn border-2 border-teboil-line bg-white/5 px-4 text-left active:bg-white/10"
            >
              <span className="w-7 shrink-0 font-display text-kiosk-sm font-black text-teboil-muted">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate font-display text-kiosk-base font-black text-teboil-black">
                {displayName(p.nickname)}
              </span>
              <span className="shrink-0 font-display text-kiosk-base font-black text-teboil-red">
                {p.todayPoints}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------ Карточка игрока ---------------------------- */

function PlayerDetails({ id, onBack }: { id: number; onBack: () => void }) {
  const [card, setCard] = useState<PlayerCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setCard(await getPlayer(id));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(eventId: number) {
    setRemoving(eventId);
    try {
      await deleteScore(eventId);
      setConfirmId(null);
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="space-y-4 pt-1">
      <button
        type="button"
        onClick={onBack}
        className="min-h-tap font-display text-kiosk-sm font-black uppercase text-teboil-muted active:text-teboil-red"
      >
        ← К списку
      </button>

      {error && (
        <p className="text-kiosk-sm font-bold text-teboil-red" role="alert">
          {error}
        </p>
      )}

      {!card ? (
        <p className="py-6 text-center text-kiosk-sm text-teboil-muted">Загрузка…</p>
      ) : (
        <>
          <div className="rounded-card border-2 border-teboil-red bg-teboil-red/10 p-4">
            <p className="font-display text-kiosk-lg font-black text-teboil-black">
              {displayName(card.nickname)}
            </p>
            <p className="text-kiosk-sm text-teboil-muted">
              сегодня {pointsLabel(card.todayPoints)}
              {card.rank !== null && ` · место ${card.rank}`}
            </p>
          </div>

          <h3 className="font-display text-kiosk-sm font-black uppercase tracking-wide text-teboil-muted">
            История начислений
          </h3>

          {card.events.length === 0 ? (
            <p className="py-4 text-center text-kiosk-sm text-teboil-muted">
              Начислений пока нет.
            </p>
          ) : (
            <ul className="space-y-2">
              {card.events.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  confirming={confirmId === event.id}
                  removing={removing === event.id}
                  onAskRemove={() => setConfirmId(event.id)}
                  onCancel={() => setConfirmId(null)}
                  onConfirm={() => void remove(event.id)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function EventRow({
  event,
  confirming,
  removing,
  onAskRemove,
  onCancel,
  onConfirm,
}: {
  event: ScoreEvent;
  confirming: boolean;
  removing: boolean;
  onAskRemove: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const comment =
    typeof event.meta?.comment === 'string' ? event.meta.comment : null;

  const detail = isSportActivity(event.activity)
    ? formatRawResult(event.activity, event.rawResult)
    : comment;

  return (
    <li className="rounded-card border-2 border-teboil-line bg-white/5 p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-display text-kiosk-sm font-black text-teboil-black">
            {ACTIVITY_LABELS[event.activity]}
          </p>
          <p className="text-kiosk-sm text-teboil-muted">
            {formatTime(event.createdAt)}
            {detail && detail !== '—' && ` · ${detail}`}
            {event.createdBy === 'admin' ? ' · оператор' : ''}
          </p>
        </div>
        <span className="shrink-0 font-display text-kiosk-base font-black text-teboil-red">
          {signedPoints(event.points)}
        </span>
      </div>

      {confirming ? (
        <div className="mt-3 flex gap-2 border-t border-teboil-line pt-3">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-tap flex-1 rounded-btn border-2 border-teboil-line font-display text-kiosk-sm font-black uppercase text-teboil-black active:bg-white/10"
          >
            Оставить
          </button>
          <button
            type="button"
            disabled={removing}
            onClick={onConfirm}
            className="min-h-tap flex-1 rounded-btn bg-teboil-red font-display text-kiosk-sm font-black uppercase text-white disabled:opacity-40"
          >
            {removing ? '…' : 'Удалить'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onAskRemove}
          className="mt-2 min-h-tap font-display text-kiosk-sm font-black uppercase text-teboil-muted active:text-teboil-red"
        >
          Отменить
        </button>
      )}
    </li>
  );
}
