'use client';

import { useEffect, useRef, useState } from 'react';
import { SCORING, obstacleFinalTime } from '@/lib/scoring';

const PENALTY = SCORING.sport.sport_obstacle.missPenaltySec;

/** «23,4» — запятая, как пишут время по-русски. */
function shown(seconds: number): string {
  return seconds.toFixed(1).replace('.', ',');
}

/** Время из поля: «23,4» и «23.4» одинаково допустимы. */
export function parseTime(input: string): number | null {
  const cleaned = input.trim().replace(',', '.');
  if (!/^\d{1,3}([.]\d)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return value > 0 ? value : null;
}

/**
 * Ввод результата полосы: время + забит ли мяч.
 *
 * Секундомер встроен, чтобы волонтёру не держать второй телефон: «Старт» на
 * старте, «Стоп» после удара — время само встаёт в поле. Поле остаётся
 * редактируемым: если засекали на чужих часах, время просто вписывается.
 *
 * Итог со штрафом показывается сразу под кнопками — волонтёр видит то же
 * число, что попадёт в рейтинг, ещё до записи. Считает его сервер, здесь
 * только предпросмотр той же формулой.
 */
export function ObstacleInput({
  time,
  onTime,
  goal,
  onGoal,
  startedAt,
  onStartedAt,
}: {
  time: string;
  onTime: (next: string) => void;
  goal: boolean | null;
  onGoal: (next: boolean) => void;
  /**
   * Когда нажали «Старт» — по часам устройства (Date.now), а не по таймеру
   * страницы. Хранит это значение родитель: так идущий забег переживает
   * перезагрузку страницы, и секундомер продолжает с верного места.
   */
  startedAt: number | null;
  onStartedAt: (next: number | null) => void;
}) {
  const [tick, setTick] = useState(() => Date.now());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (startedAt === null) return;
    setTick(Date.now());
    timer.current = setInterval(() => setTick(Date.now()), 100);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [startedAt]);

  const running = startedAt !== null;
  const elapsed = running ? Math.max(0, (tick - startedAt) / 1000) : 0;

  function toggle() {
    if (!running) {
      const now = Date.now();
      setTick(now);
      onStartedAt(now);
      return;
    }
    const seconds = Math.round(((Date.now() - startedAt) / 1000) * 10) / 10;
    onStartedAt(null);
    // Больше 999,9 секунды поле не принимает — значит, секундомер забыли остановить.
    onTime(shown(Math.min(999.9, Math.max(0.1, seconds))));
  }

  const parsed = parseTime(time);
  const final = parsed !== null && goal !== null ? obstacleFinalTime(parsed, goal) : null;

  return (
    <div className="space-y-4">
      {/* Секундомер */}
      <div className="border-2 border-teboil-blue bg-white p-3">
        <div className="flex items-baseline justify-center gap-3">
          {running ? (
            <span className="font-display text-display-md font-black tabular-nums text-teboil-red">
              {shown(elapsed)}
            </span>
          ) : (
            <input
              value={time}
              onChange={(e) => onTime(e.target.value.replace(/[^\d.,]/g, '').slice(0, 5))}
              inputMode="decimal"
              placeholder="0,0"
              aria-label="Время прохождения, секунд"
              className="w-[4.5ch] bg-transparent text-center font-display text-display-md font-black tabular-nums text-teboil-blue placeholder:text-teboil-line focus:outline-none"
            />
          )}
          <span className="font-display text-kiosk-base font-bold text-teboil-muted">сек</span>
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <button
            type="button"
            onClick={toggle}
            className={`min-h-tap-xl font-display text-kiosk-lg font-black uppercase text-white transition-colors ${
              running ? 'bg-teboil-red active:bg-teboil-red-dark' : 'bg-teboil-green active:opacity-90'
            }`}
          >
            {running ? 'Стоп' : 'Старт'}
          </button>
          <button
            type="button"
            onClick={() => {
              onStartedAt(null);
              onTime('');
            }}
            className="min-h-tap-xl border-2 border-teboil-line px-4 font-display text-kiosk-sm font-black uppercase text-teboil-muted active:bg-teboil-surface"
          >
            Сброс
          </button>
        </div>
      </div>

      {/* Удар по воротам */}
      <div>
        <p className="mb-2 font-display text-kiosk-sm font-black uppercase tracking-wide text-teboil-muted">
          Удар по воротам
        </p>
        <div className="grid grid-cols-2 gap-3">
          <GoalButton
            label="Забил"
            active={goal === true}
            tone="green"
            onClick={() => onGoal(true)}
          />
          <GoalButton
            label={`Мимо +${PENALTY} с`}
            active={goal === false}
            tone="red"
            onClick={() => onGoal(false)}
          />
        </div>
      </div>

      <p className="text-center text-kiosk-sm font-bold text-teboil-black">
        {final === null
          ? running
            ? 'Идёт забег…'
            : 'Нужно время и результат удара'
          : goal
            ? `Итог: ${shown(final)} сек`
            : `Итог: ${shown(parsed ?? 0)} + ${PENALTY} = ${shown(final)} сек`}
      </p>
    </div>
  );
}

function GoalButton({
  label,
  active,
  tone,
  onClick,
}: {
  label: string;
  active: boolean;
  tone: 'green' | 'red';
  onClick: () => void;
}) {
  const on = tone === 'green' ? 'border-teboil-green bg-teboil-green' : 'border-teboil-red bg-teboil-red';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-tap-xl border-2 font-display text-kiosk-base font-black uppercase transition-colors ${
        active ? `${on} text-white` : 'border-teboil-line bg-white text-teboil-black active:bg-teboil-surface'
      }`}
    >
      {label}
    </button>
  );
}
