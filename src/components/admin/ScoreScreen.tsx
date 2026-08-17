'use client';

import { useState } from 'react';
import type { PlayerSummary, SportActivity } from '@/lib/types';
import { isValidManualPoints } from '@/lib/scoring';
import { displayName } from '@/lib/validation';
import { errorText } from './admin-api';
import { addScore, createPlayerManually } from './endpoints';
import { SPORT_ORDER, SPORT_UI } from './activity-ui';
import { pointsLabel, signedPoints } from './format';
import { PlayerSearch } from './PlayerSearch';
import { SportInput } from './SportInput';

/**
 * Главный рабочий экран оператора: найти участника по кодовому никнейму,
 * выбрать активность, ввести результат, начислить баллы.
 *
 * Баллы предлагает система по правилам из scoring.ts, но окончательное
 * значение ставит оператор — так требует заказчик.
 */
export function ScoreScreen() {
  const [player, setPlayer] = useState<PlayerSummary | null>(null);
  const [activity, setActivity] = useState<SportActivity | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function award(rawResult: string | null, points: number) {
    if (!player || !activity) return;
    setBusy(true);
    setError(null);
    try {
      const result = await addScore({
        playerId: player.id,
        activity,
        points,
        rawResult,
      });
      setDone(
        `${displayName(player.nickname)}: ${signedPoints(points)} — сегодня ${pointsLabel(result.todayPoints)}`,
      );
      setPlayer({
        ...player,
        todayPoints: result.todayPoints,
        totalPoints: result.totalPoints,
      });
      setActivity(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (!player) {
    return (
      <div className="space-y-4 pt-1">
        {done && <Notice text={done} />}
        <PlayerSearch
          autoFocus
          onSelect={(p) => {
            setPlayer(p);
            setDone(null);
            setActivity(null);
          }}
        />
        <AddPlayer
          onCreated={(p) => {
            setPlayer(p);
            setDone(null);
            setActivity(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 pt-1">
      <div className="flex items-center justify-between gap-3 rounded-card border-2 border-teboil-red bg-teboil-red/10 p-4">
        <div className="min-w-0">
          <p className="truncate font-display text-kiosk-lg font-black text-teboil-black">
            {displayName(player.nickname)}
          </p>
          <p className="text-kiosk-sm text-teboil-muted">
            сегодня {pointsLabel(player.todayPoints)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setPlayer(null);
            setActivity(null);
            setError(null);
          }}
          className="min-h-tap shrink-0 rounded-btn border-2 border-teboil-line px-4 font-display text-kiosk-sm font-black uppercase text-teboil-black active:bg-white/10"
        >
          Сменить
        </button>
      </div>

      {done && <Notice text={done} />}

      <div>
        <h2 className="mb-3 font-display text-kiosk-sm font-black uppercase tracking-wide text-teboil-muted">
          Активность
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {SPORT_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setActivity(key);
                setError(null);
              }}
              className={`min-h-tap-lg rounded-btn border-2 px-3 py-2 font-display text-kiosk-sm font-black uppercase leading-tight tracking-tight transition-colors ${
                activity === key
                  ? 'border-teboil-red bg-teboil-red text-white'
                  : 'border-teboil-line bg-white/5 text-teboil-black active:bg-white/10'
              }`}
            >
              {SPORT_UI[key].short}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-kiosk-sm font-bold text-teboil-red">
          {error}
        </p>
      )}

      {activity && (
        <SportInput
          activity={activity}
          busy={busy}
          onSubmit={(rawResult, points) => void award(rawResult, points)}
        />
      )}

      <ManualAward
        player={player}
        onDone={(text, today, total) => {
          setDone(text);
          setPlayer((p) => (p ? { ...p, todayPoints: today, totalPoints: total } : p));
        }}
      />
    </div>
  );
}

/* ------------------------ Участник без юзернейма -------------------------- */

/**
 * Заводит участника вручную. На киоске требуется настоящий телеграм-юзернейм,
 * а он есть не у всех — без этого обхода такой человек не смог бы играть.
 */
function AddPlayer({ onCreated }: { onCreated: (p: PlayerSummary) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-tap w-full rounded-btn border-2 border-dashed border-teboil-line font-display text-kiosk-sm font-black uppercase tracking-wide text-teboil-muted active:text-teboil-red"
      >
        + Участник без юзернейма
      </button>
    );
  }

  async function submit() {
    const value = name.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      onCreated(await createPlayerManually(value));
      setOpen(false);
      setName('');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-card border-2 border-teboil-line bg-white/5 p-4">
      <p className="font-display text-kiosk-sm font-black uppercase tracking-wide text-teboil-muted">
        Новый участник
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit();
        }}
        placeholder="Имя или номер телефона"
        aria-label="Имя участника"
        autoComplete="off"
        className="min-h-tap-lg w-full rounded-btn border-2 border-teboil-line bg-teboil-ink px-4 text-kiosk-base text-teboil-black placeholder:text-teboil-muted/60 focus:border-teboil-red focus:outline-none"
      />
      <p className="text-kiosk-sm leading-snug text-teboil-muted">
        Запишите так, чтобы вы сами узнали человека при выдаче приза.
      </p>
      {error && <p className="text-kiosk-sm font-bold text-teboil-red">{error}</p>}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-tap flex-1 rounded-btn border-2 border-teboil-line font-display text-kiosk-sm font-black uppercase text-teboil-black active:bg-white/10"
        >
          Отмена
        </button>
        <button
          type="button"
          disabled={name.trim().length < 2 || busy}
          onClick={() => void submit()}
          className="min-h-tap flex-1 rounded-btn bg-teboil-red font-display text-kiosk-sm font-black uppercase text-white disabled:opacity-40"
        >
          {busy ? '…' : 'Завести'}
        </button>
      </div>
    </div>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <p
      role="status"
      className="rounded-card border-2 border-teboil-red bg-teboil-red/15 px-4 py-3 font-display text-kiosk-sm font-black text-white"
    >
      {text}
    </p>
  );
}

/* --------------------------- Произвольные баллы --------------------------- */

/**
 * Запасной инструмент: начислить баллы вне четырёх активностей. На стенде
 * случаются ситуации вне сценария, и без этого оператору пришлось бы искать
 * программиста. Уходит в отдельную активность `manual`, чтобы не искажать
 * статистику по спортивным станциям.
 */
function ManualAward({
  player,
  onDone,
}: {
  player: PlayerSummary;
  onDone: (text: string, today: number, total: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const num = Number(value.trim());
  const valid = value.trim() !== '' && isValidManualPoints(num);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-tap w-full rounded-btn font-display text-kiosk-sm font-black uppercase tracking-wide text-teboil-muted active:text-teboil-red"
      >
        Начислить вручную
      </button>
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const result = await addScore({
        playerId: player.id,
        activity: 'manual',
        points: num,
        rawResult: null,
        meta: { comment: comment.trim() || null },
      });
      onDone(
        `${displayName(player.nickname)}: ${signedPoints(num)} вручную`,
        result.todayPoints,
        result.totalPoints,
      );
      setOpen(false);
      setValue('');
      setComment('');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-card border-2 border-teboil-line bg-white/5 p-4">
      <p className="font-display text-kiosk-sm font-black uppercase tracking-wide text-teboil-muted">
        Ручное начисление
      </p>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder="Баллы"
        aria-label="Баллы"
        className="min-h-tap-lg w-full rounded-btn border-2 border-teboil-line bg-teboil-ink px-4 text-center text-kiosk-lg font-black tabular-nums text-teboil-black focus:border-teboil-red focus:outline-none"
      />
      <input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Комментарий (необязательно)"
        aria-label="Комментарий"
        className="min-h-tap w-full rounded-btn border-2 border-teboil-line bg-teboil-ink px-4 text-kiosk-sm text-teboil-black placeholder:text-teboil-muted/60 focus:border-teboil-red focus:outline-none"
      />
      {error && <p className="text-kiosk-sm font-bold text-teboil-red">{error}</p>}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-tap flex-1 rounded-btn border-2 border-teboil-line font-display text-kiosk-sm font-black uppercase text-teboil-black active:bg-white/10"
        >
          Отмена
        </button>
        <button
          type="button"
          disabled={!valid || busy}
          onClick={() => void submit()}
          className="min-h-tap flex-1 rounded-btn bg-teboil-red font-display text-kiosk-sm font-black uppercase text-white disabled:opacity-40"
        >
          {busy ? '…' : 'Начислить'}
        </button>
      </div>
    </div>
  );
}
