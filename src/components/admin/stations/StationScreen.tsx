'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PlayerSummary } from '@/lib/types';
import { formatRatingValue, type RatingBoard, type StationEntry } from '@/lib/rating-defs';
import { obstacleFinalTime, suggestPoints } from '@/lib/scoring';
import { displayName } from '@/lib/validation';
import { errorText } from '../admin-api';
import { addScore, deleteScore, getPlayerRatings, getStation } from '../endpoints';
import { AddPlayer } from '../AddPlayer';
import { PlayerSearch } from '../PlayerSearch';
import { CountInput } from './CountInput';
import { ObstacleInput, parseTime } from './ObstacleInput';
import { StationBoard } from './StationBoard';
import { STATIONS, unitFor, type StationId } from './station-config';

/** Как часто подтягивать записи коллег на той же станции. */
const REFRESH_MS = 15_000;

interface Done {
  text: string;
  place: string | null;
}

/**
 * Рабочий экран волонтёра на станции.
 *
 * Порядок как в очереди: участник называет юзернейм → волонтёр находит его →
 * вводит результат → «Записать». После записи экран сразу готов к
 * следующему человеку, а наверху остаётся подтверждение с местом в рейтинге,
 * чтобы его можно было сказать участнику вслух.
 *
 * Баллы за попытку считаются автоматически по правилам из scoring.ts: на
 * станции важен результат (касания, очки, время), по нему строится рейтинг.
 * Поправить баллы вручную можно на вкладке «Вручную».
 */
export function StationScreen({
  station,
  onLeave,
}: {
  station: StationId;
  onLeave: () => void;
}) {
  const config = STATIONS[station];

  const [player, setPlayer] = useState<PlayerSummary | null>(null);
  const [count, setCount] = useState('');
  const [time, setTime] = useState('');
  const [goal, setGoal] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const [board, setBoard] = useState<RatingBoard | null>(null);
  const [entries, setEntries] = useState<StationEntry[]>([]);

  const reload = useCallback(async () => {
    try {
      const data = await getStation(station);
      setBoard(data.board);
      setEntries(data.entries);
    } catch {
      // Таблица внизу — справочная. Ввод результата от неё не зависит,
      // поэтому сбой подгрузки не мешает работать.
    }
  }, [station]);

  useEffect(() => {
    void reload();
    const t = setInterval(() => void reload(), REFRESH_MS);
    return () => clearInterval(t);
  }, [reload]);

  function resetInput() {
    setCount('');
    setTime('');
    setGoal(null);
  }

  /* Сырой результат и предпросмотр баллов — по типу станции. */
  const parsedTime = parseTime(time);
  const raw =
    config.input === 'count'
      ? count === ''
        ? null
        : count
      : parsedTime !== null && goal !== null
        ? String(parsedTime)
        : null;
  const finalValue =
    raw === null
      ? null
      : config.input === 'count'
        ? Number(raw)
        : obstacleFinalTime(Number(raw), goal === true);
  const points = finalValue === null ? null : suggestPoints(config.activity, finalValue);

  async function submit() {
    if (!player || raw === null || points === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      await addScore({
        playerId: player.id,
        activity: config.activity,
        points,
        rawResult: raw,
        meta: config.input === 'obstacle' ? { goal } : null,
      });

      const result = `${formatRatingValue(station, finalValue ?? 0)} ${unitFor(station, finalValue ?? 0)}`;
      let place: string | null = null;
      try {
        const mine = (await getPlayerRatings(player.id))[station];
        if (mine) {
          const best =
            mine.value !== finalValue
              ? ` (лучший результат — ${formatRatingValue(station, mine.value)})`
              : '';
          place = `${mine.rank}-е место из ${mine.of}${best}`;
        }
      } catch {
        // Без места подтверждение всё равно полезно — запись уже сохранена.
      }

      setDone({ text: `${displayName(player.nickname)}: ${result}`, place });
      setPlayer(null);
      resetInput();
      void reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function undo(entry: StationEntry) {
    try {
      await deleteScore(entry.eventId);
      setDone(null);
      await reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <div className="space-y-5 pt-1">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-kiosk-lg font-black leading-tight text-teboil-blue">
            {config.title}
          </h1>
          <p className="text-kiosk-sm text-teboil-muted">{config.rule}</p>
        </div>
        <button
          type="button"
          onClick={onLeave}
          className="min-h-tap shrink-0 border-2 border-teboil-line px-3 font-display text-[14px] font-black uppercase text-teboil-muted active:bg-teboil-surface"
        >
          Станции
        </button>
      </div>

      {done && (
        <div role="status" className="border-2 border-teboil-green bg-teboil-green/10 px-4 py-3">
          <p className="font-display text-kiosk-base font-black text-teboil-black">
            ✓ Записано — {done.text}
          </p>
          {done.place && <p className="text-kiosk-sm font-bold text-teboil-black">{done.place}</p>}
        </div>
      )}

      {error && (
        <p role="alert" className="bg-teboil-red px-4 py-3 text-kiosk-sm font-bold text-white">
          {error}
        </p>
      )}

      {!player ? (
        <div className="space-y-4">
          <PlayerSearch autoFocus onSelect={(p) => { setPlayer(p); setError(null); }} />
          <AddPlayer onCreated={(p) => { setPlayer(p); setError(null); }} />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3 border-2 border-teboil-blue bg-teboil-blue/5 p-4">
            {/* Ник целиком, без обрезки: волонтёр сверяет его с тем, что назвал
                участник, и «@maria_dru…» легко спутать с соседом по очереди. */}
            <p className="min-w-0 break-all font-display text-kiosk-base font-black leading-tight text-teboil-black">
              {displayName(player.nickname)}
            </p>
            <button
              type="button"
              onClick={() => {
                setPlayer(null);
                setError(null);
              }}
              className="min-h-tap shrink-0 border-2 border-teboil-line px-4 font-display text-kiosk-sm font-black uppercase text-teboil-black active:bg-teboil-surface"
            >
              Сменить
            </button>
          </div>

          {config.input === 'count' ? (
            <CountInput
              value={count}
              onChange={setCount}
              unit={unitFor(station, Number(count) || 0)}
              max={config.max}
            />
          ) : (
            <ObstacleInput time={time} onTime={setTime} goal={goal} onGoal={setGoal} />
          )}

          <button
            type="button"
            disabled={raw === null || busy}
            onClick={() => void submit()}
            className="min-h-tap-xl w-full bg-teboil-red font-display text-kiosk-lg font-black uppercase text-white transition-colors active:bg-teboil-red-dark disabled:opacity-40"
          >
            {busy ? 'Записываем…' : 'Записать результат'}
          </button>
          {points !== null && (
            <p className="-mt-3 text-center text-kiosk-sm text-teboil-muted">
              В общий зачёт участнику уйдёт +{points}
            </p>
          )}
        </div>
      )}

      <StationBoard station={station} board={board} entries={entries} onUndo={undo} />
    </div>
  );
}
