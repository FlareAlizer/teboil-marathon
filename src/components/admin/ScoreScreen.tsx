'use client';

import { useState } from 'react';
import type { PlayerSummary } from '@/lib/types';
import { isValidManualPoints } from '@/lib/scoring';
import { displayName } from '@/lib/validation';
import { errorText } from './admin-api';
import { addScore } from './endpoints';
import { pointsLabel, signedPoints } from './format';
import { AddPlayer } from './AddPlayer';
import { PlayerSearch } from './PlayerSearch';

/**
 * Вкладка «Вручную»: найти участника и начислить баллы вне станций.
 *
 * Результаты чеканки, дартса и полосы вносятся на вкладке «Станции» — там
 * у каждой станции свой удобный ввод и свой рейтинг. Здесь остаётся только
 * запасной инструмент на случай ситуаций вне сценария.
 */
export function ScoreScreen() {
  const [player, setPlayer] = useState<PlayerSummary | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (!player) {
    return (
      <div className="space-y-4 pt-1">
        {done && <Notice text={done} />}
        <PlayerSearch
          autoFocus
          onSelect={(p) => {
            setPlayer(p);
            setDone(null);
          }}
        />
        <AddPlayer
          onCreated={(p) => {
            setPlayer(p);
            setDone(null);
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
          onClick={() => setPlayer(null)}
          className="min-h-tap shrink-0 rounded-btn border-2 border-teboil-line px-4 font-display text-kiosk-sm font-black uppercase text-teboil-black active:bg-teboil-surface"
        >
          Сменить
        </button>
      </div>

      {done && <Notice text={done} />}

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

function Notice({ text }: { text: string }) {
  return (
    <p
      role="status"
      className="rounded-card border-2 border-teboil-red bg-teboil-red/10 px-4 py-3 font-display text-kiosk-sm font-black text-teboil-black"
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
  // На вкладке «Вручную» форма — единственное действие, прятать её незачем.
  const [open, setOpen] = useState(true);
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
