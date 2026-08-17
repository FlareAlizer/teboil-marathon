'use client';

import { useEffect, useState } from 'react';

/**
 * Значение с задержкой. Нужно живому поиску игрока: оператор диктует никнейм
 * на слух и печатает урывками, дёргать сервер на каждую букву не нужно.
 * 220 мс — на глаз мгновенно, но лишние запросы уже отсекает.
 */
export function useDebouncedValue<T>(value: T, delayMs = 220): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
