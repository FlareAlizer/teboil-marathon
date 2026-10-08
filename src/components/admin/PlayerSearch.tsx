'use client';

import { useEffect, useRef, useState } from 'react';
import type { PlayerSummary } from '@/lib/types';
import { errorText } from './admin-api';
import { searchPlayers } from './endpoints';
import { pointsLabel } from './format';
import { rankByNickname } from './search-match';
import { displayName } from '@/lib/validation';
import { useDebouncedValue } from './use-debounced';
import { trace } from '@/lib/client-trace';
import { cachedPlayers, rememberPlayers } from './players-cache';

/** Сколько подсказок показывать: больше на экране телефона не помещается. */
const LIMIT = 8;

/** «@Vanya » → «Vanya»: в базе ники хранятся без «@», а волонтёр его пишет. */
export function cleanQuery(value: string): string {
  return value.trim().replace(/^@+/, '').trim();
}

/**
 * Поиск участника с выпадающими подсказками.
 *
 * Волонтёр начинает вводить ник — под полем сразу выпадает список
 * подходящих участников, остаётся ткнуть в нужного. Участник называет ник
 * голосом в шуме стенда, поэтому:
 *  - «@» в начале игнорируется (в базе ники без него);
 *  - поиск идёт по части слова и без учёта регистра (это делает сервер);
 *  - выдача пересортировывается с учётом «ё», латиницы вместо кириллицы и
 *    пропущенных букв — самый вероятный игрок оказывается первым;
 *  - Enter выбирает первую подсказку.
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
  const [open, setOpen] = useState(false);
  /** Сервер не ответил — показываем найденное в памяти устройства. */
  const [offline, setOffline] = useState(false);
  const [active, setActive] = useState(0);

  const debounced = useDebouncedValue(cleanQuery(query), 150);
  // Ответы могут прийти не в том порядке, в каком уходили запросы.
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    if (debounced === '') {
      setPlayers([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    searchPlayers(debounced, LIMIT * 2)
      .then((found) => {
        if (id !== requestId.current) return;
        rememberPlayers(found);
        setPlayers(found);
        setOffline(false);
        setError(null);
        setActive(0);
      })
      .catch((e: unknown) => {
        if (id !== requestId.current) return;
        // Связи нет — ищем среди тех, кого панель уже видела. Этого хватает,
        // чтобы не держать человека в очереди до возвращения сети.
        const needle = debounced.toLowerCase();
        const local = cachedPlayers().filter((p) => p.nickname.toLowerCase().includes(needle));
        setPlayers(local);
        setOffline(true);
        trace('search_offline', { q: typed.length });
        setError(local.length > 0 ? null : errorText(e));
        setActive(0);
      })
      .finally(() => {
        if (id === requestId.current) setBusy(false);
      });
  }, [debounced]);

  const typed = cleanQuery(query);
  const shown = rankByNickname(players, debounced).slice(0, LIMIT);
  const showList = open && typed !== '';

  function choose(player: PlayerSummary) {
    setOpen(false);
    setQuery('');
    onSelect(player);
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // Задержка — чтобы касание по подсказке успело сработать до закрытия.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, shown.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && shown[active]) {
            e.preventDefault();
            choose(shown[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        placeholder="Начни вводить ник"
        aria-label="Поиск участника по нику"
        role="combobox"
        aria-expanded={showList}
        aria-controls="player-suggestions"
        aria-autocomplete="list"
        autoFocus={autoFocus}
        // text, а не search: у search браузер рисует свой крестик рядом с нашим.
        type="text"
        inputMode="search"
        enterKeyHint="search"
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        className="w-full min-h-tap-lg rounded-btn border-2 border-teboil-blue bg-white px-5 pr-14 text-kiosk-lg text-teboil-black placeholder:text-teboil-muted/60 focus:border-teboil-red focus:outline-none"
      />
      {query.length > 0 && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setQuery('');
            setOpen(true);
          }}
          aria-label="Очистить поиск"
          className="absolute right-2 top-[36px] flex h-11 w-11 -translate-y-1/2 items-center justify-center text-kiosk-lg text-teboil-muted active:bg-teboil-surface"
        >
          ✕
        </button>
      )}

      {showList && (
        <div
          id="player-suggestions"
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-[60vh] overflow-y-auto border-2 border-teboil-blue bg-white shadow-card"
        >
          {error ? (
            <p className="px-4 py-3 text-kiosk-sm font-bold text-teboil-red">{error}</p>
          ) : shown.length === 0 ? (
            <p className="px-4 py-3 text-kiosk-sm text-teboil-muted">
              {busy ? 'Ищем…' : 'Никого не нашли — проверь ник или заведи участника ниже'}
            </p>
          ) : (
            <ul>
              {offline && (
                <li className="border-b border-teboil-line bg-teboil-surface px-4 py-2 text-[13px] font-bold text-teboil-muted">
                  Нет связи — показаны участники из памяти устройства
                </li>
              )}
              {shown.map((player, index) => (
                <li key={player.id} role="option" aria-selected={index === active}>
                  <button
                    type="button"
                    // Выбор на нажатии, а не на отпускании: иначе поле успевает
                    // потерять фокус и список закрывается раньше, чем сработает тап.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(player)}
                    className={`flex min-h-tap w-full items-center justify-between gap-3 border-b border-teboil-line px-4 py-2 text-left last:border-b-0 ${
                      index === active ? 'bg-teboil-blue/10' : 'bg-white active:bg-teboil-surface'
                    }`}
                  >
                    <span className="min-w-0 flex-1 break-all font-display text-kiosk-base font-bold leading-tight text-teboil-black">
                      <Highlight text={displayName(player.nickname)} query={typed} />
                    </span>
                    <span className="shrink-0 text-[14px] font-bold tabular-nums text-teboil-muted">
                      {pointsLabel(player.todayPoints)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Подсвечивает совпавшую часть ника — глаз сразу видит, почему он в списке. */
function Highlight({ text, query }: { text: string; query: string }) {
  const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-transparent text-teboil-red">{text.slice(at, at + query.length)}</mark>
      {text.slice(at + query.length)}
    </>
  );
}
