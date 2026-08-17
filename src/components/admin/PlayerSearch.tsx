'use client';

import { useEffect, useRef, useState } from 'react';
import type { PlayerSummary } from '@/lib/types';
import { errorText } from './admin-api';
import { searchPlayers } from './endpoints';
import { pointsLabel } from './format';
import { rankByNickname } from './search-match';
import { displayName } from '@/lib/validation';
import { useDebouncedValue } from './use-debounced';

/**
 * Живой поиск участника по кодовому никнейму.
 *
 * Участник называет никнейм голосом в шуме стенда, поэтому:
 *  - поиск идёт по части слова и без учёта регистра (это делает сервер);
 *  - выдача дополнительно пересортировывается на клиенте с учётом «ё», латиницы
 *    вместо кириллицы и пропущенных букв — вероятный игрок оказывается первым;
 *  - пустой запрос показывает тех, кто уже приходил сегодня.
 */
export function PlayerSearch({
  onSelect,
  autoFocus = false,
}: {
  onSelect: (player: PlayerSummary) => void;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [players, setPlayers] = useState<PlayerSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const debounced = useDebouncedValue(query);
  // Ответы могут прийти не в том порядке, в каком уходили запросы.
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    setBusy(true);

    searchPlayers(debounced.trim())
      .then((found) => {
        if (id !== requestId.current) return;
        setPlayers(found);
        setError(null);
      })
      .catch((e: unknown) => {
        if (id !== requestId.current) return;
        setPlayers([]);
        setError(errorText(e));
      })
      .finally(() => {
        if (id === requestId.current) setBusy(false);
      });
  }, [debounced]);

  const shown = rankByNickname(players, debounced);

  return (
    <div>
      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Никнейм участника"
          aria-label="Поиск участника по никнейму"
          autoFocus={autoFocus}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full min-h-tap-lg rounded-btn border-2 border-teboil-line bg-teboil-ink px-5 pr-14 text-kiosk-lg text-teboil-black placeholder:text-teboil-muted/60 focus:border-teboil-red focus:outline-none"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Очистить поиск"
            className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-kiosk-lg text-teboil-muted active:bg-white/10"
          >
            ✕
          </button>
        )}
      </div>

      <p className="mt-2 min-h-[1.5rem] text-kiosk-sm text-teboil-muted">
        {error ? (
          <span className="font-bold text-teboil-red">{error}</span>
        ) : busy ? (
          'Ищем…'
        ) : query.trim() === '' ? (
          'Участники сегодняшнего дня'
        ) : shown.length === 0 ? (
          'Никого не нашли — проверьте никнейм'
        ) : (
          `Найдено: ${shown.length}`
        )}
      </p>

      <ul className="mt-2 space-y-2">
        {shown.map((player) => (
          <li key={player.id}>
            <button
              type="button"
              onClick={() => onSelect(player)}
              className="flex min-h-tap-lg w-full items-center justify-between gap-4 rounded-btn border border-teboil-line bg-teboil-surface px-5 py-3 text-left transition-colors active:bg-teboil-elevated"
            >
              <span className="min-w-0 flex-1 truncate font-display text-kiosk-lg font-black uppercase leading-tight text-teboil-black">
                {displayName(player.nickname)}
              </span>
              <span className="shrink-0 text-kiosk-sm font-bold tabular-nums text-teboil-red-light">
                {pointsLabel(player.todayPoints)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
