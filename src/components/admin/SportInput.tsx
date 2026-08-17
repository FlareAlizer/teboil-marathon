'use client';

import { useEffect, useState } from 'react';
import type { SportActivity } from '@/lib/types';
import { SCORING, isValidManualPoints, suggestPoints } from '@/lib/scoring';
import { Button } from '@/components/ui/Button';
import {
  GOAL_HIT,
  GOAL_MISS,
  SPORT_UI,
  applyStep,
  inputAttrsFor,
  parseSportResult,
} from './activity-ui';

/**
 * Ввод результата спортивной активности.
 *
 * Под каждый тип результата — своя клавиатура и свои быстрые кнопки, чтобы
 * оператор не набирал цифры на мелкой раскладке в очереди. Баллы система
 * предлагает сама, но поле остаётся редактируемым: по условию заказчика
 * итоговое значение за спорт ставит оператор.
 */
export function SportInput({
  activity,
  busy,
  onSubmit,
}: {
  activity: SportActivity;
  busy: boolean;
  onSubmit: (rawResult: string, points: number) => void;
}) {
  const ui = SPORT_UI[activity];
  const [raw, setRaw] = useState('');
  const [points, setPoints] = useState('');
  const [edited, setEdited] = useState(false);

  // Смена активности сбрасывает всё: это уже другой результат.
  useEffect(() => {
    setRaw('');
    setPoints('');
    setEdited(false);
  }, [activity]);

  const parsed = parseSportResult(activity, raw);
  const suggested = parsed ? suggestPoints(activity, parsed.canonical) : null;

  // Пока оператор не тронул поле баллов, оно следует за предложением.
  useEffect(() => {
    if (!edited) setPoints(suggested === null ? '' : String(suggested));
  }, [suggested, edited]);

  const pointsValue = Number(points);
  const pointsOk = points.trim() !== '' && isValidManualPoints(pointsValue);
  const canSubmit = parsed !== null && pointsOk && !busy;

  return (
    <div className="mt-5">
      <p className="mb-3 font-display text-kiosk-sm font-black uppercase tracking-wide text-teboil-muted">
        {ui.prompt}
      </p>

      {ui.kind === 'binary' ? (
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: GOAL_HIT, label: ui.positiveLabel ?? 'Попал' },
            { value: GOAL_MISS, label: ui.negativeLabel ?? 'Не попал' },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setRaw(option.value)}
              aria-pressed={raw === option.value}
              className={`min-h-tap-xl rounded-btn border-2 font-display text-kiosk-lg font-black uppercase transition-colors ${
                raw === option.value
                  ? 'border-teboil-red bg-teboil-red text-white'
                  : 'border-teboil-line bg-teboil-surface text-teboil-black active:bg-teboil-elevated'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <input
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={ui.placeholder}
              aria-label={ui.prompt}
              {...inputAttrsFor(ui.kind)}
              className="w-full min-h-tap-xl rounded-btn border-2 border-teboil-line bg-teboil-ink px-5 text-center font-display text-display-sm tabular-nums text-teboil-black placeholder:text-teboil-muted/40 focus:border-teboil-red focus:outline-none"
            />
            <span className="shrink-0 font-display text-kiosk-base font-black uppercase text-teboil-muted">
              {ui.unit}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => setRaw('')}
              className="min-h-tap rounded-btn border border-teboil-line font-display text-kiosk-sm font-black uppercase text-teboil-muted active:bg-white/10"
            >
              Сброс
            </button>
            {ui.steps.map((step) => (
              <button
                key={step}
                type="button"
                onClick={() => setRaw((prev) => applyStep(activity, prev, step))}
                className="min-h-tap rounded-btn border border-teboil-line bg-teboil-surface font-display text-kiosk-base font-black tabular-nums text-teboil-black active:bg-teboil-elevated"
              >
                +{step}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Баллы: предложены системой, но последнее слово за оператором */}
      <div className="mt-6 rounded-card border border-teboil-line bg-teboil-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="font-display text-kiosk-sm font-black uppercase tracking-wide text-teboil-muted">
            Баллы
          </span>
          {edited && suggested !== null && (
            <button
              type="button"
              onClick={() => {
                setEdited(false);
                setPoints(String(suggested));
              }}
              className="min-h-tap px-2 text-kiosk-sm font-bold text-teboil-red-light"
            >
              Вернуть {suggested}
            </button>
          )}
        </div>

        <input
          value={points}
          onChange={(e) => {
            setEdited(true);
            setPoints(e.target.value);
          }}
          placeholder="0"
          aria-label="Итоговые баллы"
          inputMode="numeric"
          pattern="[0-9]*"
          className={`mt-3 w-full min-h-tap-lg rounded-btn border-2 bg-teboil-ink px-5 text-center font-display text-kiosk-xl tabular-nums text-teboil-black focus:outline-none ${
            points.trim() !== '' && !pointsOk
              ? 'border-teboil-red'
              : 'border-teboil-line focus:border-teboil-red'
          }`}
        />

        <p className="mt-2 text-center text-kiosk-sm text-teboil-muted">
          {points.trim() !== '' && !pointsOk
            ? `Допустимо от ${SCORING.manual.min} до ${SCORING.manual.max}`
            : parsed === null
              ? 'Сначала введите результат'
              : edited
                ? `Система предлагала ${suggested}`
                : 'Значение предложено системой — можно изменить'}
        </p>
      </div>

      <Button
        type="button"
        size="xl"
        fullWidth
        loading={busy}
        disabled={!canSubmit}
        onClick={() => {
          if (parsed) onSubmit(parsed.canonical, pointsValue);
        }}
        className="mt-5"
      >
        Начислить
      </Button>
    </div>
  );
}
