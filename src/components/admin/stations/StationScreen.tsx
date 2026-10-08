'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PlayerSummary } from '@/lib/types';
import { formatRatingValue, type RatingBoard, type StationEntry } from '@/lib/rating-defs';
import { obstacleFinalTime, suggestPoints } from '@/lib/scoring';
import { displayName } from '@/lib/validation';
import { HOUR, clearState, loadState, saveState } from '@/lib/persist';
import { AdminApiError, errorText } from '../admin-api';
import { trace } from '@/lib/client-trace';
import { enqueue, isTransientStatus, newClientId } from '../outbox';
import { refreshPlayersCache } from '../players-cache';
import { addScore, deleteScore, getPlayerRatings, getStation } from '../endpoints';
import { AddPlayer } from '../AddPlayer';
import { PlayerSearch } from '../PlayerSearch';
import { CountInput } from './CountInput';
import { ObstacleInput, parseTime } from './ObstacleInput';
import { StationBoard } from './StationBoard';
import { STATIONS, unitFor, type StationId } from './station-config';

/** Как часто подтягивать записи коллег на той же станции. */
const REFRESH_MS = 15_000;

/** Несохранённая работа волонтёра на станции — см. черновик ниже. */
interface Draft {
  player: PlayerSummary | null;
  count: string;
  time: string;
  goal: boolean | null;
  startedAt: number | null;
}

interface Done {
  text: string;
  place: string | null;
}

/**
 * Рабочий экран волонтёра на станции.
 *
 * Порядок как в очереди: участник называет ник → волонтёр находит его →
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

  // Черновик: кого выбрали и что успели набрать. Если страницу перезагрузят
  // посреди записи (экран погас, сеть моргнула), волонтёр продолжит с того же
  // места — вплоть до идущего секундомера. Экран рисуется только в браузере
  // после входа, поэтому читать память устройства прямо здесь безопасно.
  const draftKey = `teboil.admin.draft.${station}`;
  const [draft] = useState(() => loadState<Draft>(draftKey, 12 * HOUR));

  const [player, setPlayer] = useState<PlayerSummary | null>(draft?.player ?? null);
  const [count, setCount] = useState(draft?.count ?? '');
  const [time, setTime] = useState(draft?.time ?? '');
  const [goal, setGoal] = useState<boolean | null>(draft?.goal ?? null);
  const [startedAt, setStartedAt] = useState<number | null>(draft?.startedAt ?? null);
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

  // Запасной список участников для поиска без сети — обновляем в фоне.
  useEffect(() => {
    void refreshPlayersCache();
    const t = setInterval(() => void refreshPlayersCache(), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!player && count === '' && time === '' && goal === null && startedAt === null) {
      clearState(draftKey);
    } else {
      saveState<Draft>(draftKey, { player, count, time, goal, startedAt });
    }
  }, [draftKey, player, count, time, goal, startedAt]);

  function resetInput() {
    setCount('');
    setTime('');
    setGoal(null);
    setStartedAt(null);
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
    // Метка записи: с ней повторная отправка после обрыва не создаст дубль.
    const clientId = newClientId();
    const meta = config.input === 'obstacle' ? { goal } : null;
    const result = `${formatRatingValue(station, finalValue ?? 0)} ${unitFor(station, finalValue ?? 0)}`;
    try {
      await addScore({
        playerId: player.id,
        activity: config.activity,
        points,
        rawResult: raw,
        meta,
        clientId,
      });

      trace('score_saved', { station, cid: clientId, player: player.id, raw });

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
      // Нет связи — не держим человека и не теряем результат: запись ложится
      // в очередь на устройстве и уйдёт на сервер сама.
      // Сервер ответил сбоем (502 при перезапуске, 504) — запись могла и
      // сохраниться. Повтор с новой меткой создал бы дубль, а с этой же —
      // нет, поэтому такие записи тоже уходят в очередь.
      if (e instanceof AdminApiError && isTransientStatus(e.status)) {
        trace('score_queued', { station, cid: clientId, player: player.id, status: e.status });
        enqueue({
          clientId,
          playerId: player.id,
          nickname: player.nickname,
          activity: config.activity,
          points,
          rawResult: raw,
          meta,
          label: result,
          at: Date.now(),
        });
        setDone({
          text: `${displayName(player.nickname)}: ${result}`,
          place:
            e.status === 0
              ? 'Связи нет — запись сохранена на устройстве и уйдёт сама'
              : 'Сервер не ответил — запись сохранена на устройстве и уйдёт сама',
        });
        setPlayer(null);
        resetInput();
      } else {
        setError(errorText(e));
      }
    } finally {
      setBusy(false);
    }
  }

  async function undo(entry: StationEntry) {
    try {
      await deleteScore(entry.eventId);
      trace('score_undo', { station, event: entry.eventId, player: entry.playerId });
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
            <ObstacleInput
              time={time}
              onTime={setTime}
              goal={goal}
              onGoal={setGoal}
              startedAt={startedAt}
              onStartedAt={setStartedAt}
            />
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
