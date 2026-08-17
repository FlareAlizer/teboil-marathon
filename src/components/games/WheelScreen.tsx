'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import SpinWheel, { type WheelSector, type SpinWheelHandle } from './SpinWheel';
import { QuizButton, QuizScreen } from './quiz-ui';

/**
 * Колесо тем — макет 31:716.
 *
 * Механика рулетки не меняется: колесо пересобирается перед каждым уровнем из
 * тем, где на этом уровне ещё остались вопросы, поэтому мёртвых секторов не
 * бывает. Здесь только оформление и один шаг подтверждения: выпавшая тема
 * показывается в плашке «Твоя тема», и участник сам решает идти к вопросу —
 * иначе результат вращения мелькал бы и исчезал.
 *
 * Второй путь — «Выбрать тему»: тот же список тем, но руками. В макете это
 * отдельный экран (49:332), кнопка сюда и ведёт.
 */
export function WheelScreen({
  points,
  sectors,
  onPick,
  onChooseManually,
  onStations,
}: {
  points: number;
  sectors: WheelSector[];
  onPick: (sector: WheelSector) => void;
  onChooseManually: () => void;
  onStations: () => void;
}) {
  const wheelRef = useRef<SpinWheelHandle>(null);
  const [result, setResult] = useState<{ sector: WheelSector; index: number } | null>(null);
  const [spinning, setSpinning] = useState(false);

  // Новый уровень — новый набор тем: старый результат к нему не относится.
  useEffect(() => {
    setResult(null);
    setSpinning(false);
  }, [sectors]);

  // Колесо держит этот колбэк в таймере-страховке, поэтому ссылка должна быть
  // стабильной — иначе он пересоздавался бы на каждый ререндер вращения.
  const handleResult = useCallback((sector: WheelSector, index: number) => {
    setSpinning(false);
    setResult({ sector, index });
  }, []);

  const handleSpinStart = useCallback(() => setSpinning(true), []);

  return (
    <QuizScreen points={points}>
      <h1 className="mx-auto mb-8 max-w-[320px] text-center font-display text-[1.6rem] font-black leading-tight text-white">
        Крути колесо, чтобы выбрать тему
      </h1>

      <SpinWheel
        ref={wheelRef}
        sectors={sectors}
        hideButton
        onSpinStart={handleSpinStart}
        onResult={handleResult}
        className="mb-9"
      />

      <p className="mb-2 text-center text-kiosk-sm font-bold text-teboil-blue-pale">
        Твоя тема
      </p>
      <div className="-mx-5 flex min-h-[72px] items-center justify-center bg-teboil-blue-80 px-5">
        <p className="text-center font-display text-kiosk-lg font-bold text-white">
          {result ? `${result.index + 1})  ${result.sector.label}` : '—'}
        </p>
      </div>

      <div className="mt-auto flex flex-col items-center gap-4 pt-9">
        {result ? (
          <QuizButton onClick={() => onPick(result.sector)}>К вопросу</QuizButton>
        ) : (
          <QuizButton
            onClick={() => wheelRef.current?.spin()}
            disabled={spinning || sectors.length === 0}
          >
            {spinning ? 'Крутится…' : 'Крутить колесо'}
          </QuizButton>
        )}

        {!result && (
          <QuizButton tone="pale" onClick={onChooseManually} disabled={spinning}>
            Выбрать тему
          </QuizButton>
        )}

        <QuizButton tone="pale" onClick={onStations} disabled={spinning}>
          К станциям
        </QuizButton>
      </div>
    </QuizScreen>
  );
}
