'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface PolledState<T> {
  /** Последние удачно полученные данные. При ошибке остаются прежними. */
  data: T | null;
  /** true только до самой первой загрузки — чтобы не мигать при обновлениях. */
  loading: boolean;
  /** Связь потеряна: показываем тихую метку, но экран не гасим. */
  stale: boolean;
}

/**
 * Периодический опрос для экрана лидерборда.
 *
 * Экран висит на телевизоре без присмотра, поэтому:
 *  - при ошибке сети данные НЕ обнуляются, на экране остаётся прошлый топ;
 *  - индикатор загрузки показывается только один раз, при первом открытии;
 *  - опрос ставится на паузу, когда вкладка скрыта, и сразу обновляется,
 *    когда экран снова виден.
 */
export function usePolled<T>(
  fetcher: () => Promise<T>,
  intervalMs = 10_000,
): PolledState<T> {
  const [state, setState] = useState<PolledState<T>>({
    data: null,
    loading: true,
    stale: false,
  });

  // Держим свежую ссылку на fetcher, чтобы не пересоздавать таймер каждый рендер.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const data = await fetcherRef.current();
      if (!alive.current) return;
      setState({ data, loading: false, stale: false });
    } catch {
      if (!alive.current) return;
      setState((prev) => ({ data: prev.data, loading: false, stale: true }));
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, intervalMs);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive.current = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load, intervalMs]);

  return state;
}
