'use client';

import { useEffect, useState } from 'react';
import { StationScreen } from './StationScreen';
import {
  STATIONS,
  STATION_ORDER,
  loadStation,
  saveStation,
  type StationId,
} from './station-config';

/**
 * Вкладка «Станции»: три большие плитки — чеканка, дартс, полоса. Волонтёр
 * один раз выбирает, где сидит, и дальше работает только со своей станцией.
 * Выбор запоминается на устройстве.
 */
export function StationsTab() {
  const [station, setStation] = useState<StationId | null>(null);
  const [ready, setReady] = useState(false);

  // localStorage доступен только в браузере — читаем после монтирования.
  useEffect(() => {
    setStation(loadStation());
    setReady(true);
  }, []);

  function choose(id: StationId | null) {
    saveStation(id);
    setStation(id);
  }

  if (!ready) return null;

  if (station) {
    return <StationScreen key={station} station={station} onLeave={() => choose(null)} />;
  }

  return (
    <div className="space-y-4 pt-1">
      <h1 className="font-display text-kiosk-xl font-black text-teboil-blue">Где ты сегодня?</h1>
      <p className="text-kiosk-sm text-teboil-muted">
        Выбери свою станцию — дальше будешь вносить результаты только по ней.
      </p>

      <ul className="space-y-3">
        {STATION_ORDER.map((id, index) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => choose(id)}
              className={`flex min-h-[112px] w-full items-center gap-4 px-5 py-4 text-left text-white transition-colors ${
                index % 2 === 0
                  ? 'bg-teboil-blue active:bg-teboil-blue-80'
                  : 'bg-teboil-red active:bg-teboil-red-dark'
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block font-display text-kiosk-xl font-black leading-tight">
                  {STATIONS[id].title}
                </span>
                <span className="mt-1 block text-kiosk-sm font-medium leading-snug">
                  {STATIONS[id].rule}
                </span>
              </span>
              <span aria-hidden className="font-display text-kiosk-xl font-black">
                →
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
