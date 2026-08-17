'use client';

import { useCallback } from 'react';
import { getLeaderboard, getStats } from '@/components/admin/endpoints';
import { LEADERBOARD_SIZE, LeaderboardRows } from './leaderboard-rows';
import { LeaderboardFooter, LeaderboardHeader } from './leaderboard-chrome';
import { usePolled } from './use-polled';
import type { LeaderboardRow } from '@/lib/types';

interface BoardData {
  rows: LeaderboardRow[];
  visitors: number;
}

/**
 * Экран для второго монитора (телевизора) на стенде.
 *
 * Висит без присмотра: никаких кнопок, ничего не нажимается, при обрыве связи
 * на экране остаются последние данные. Обновление раз в 10 секунд затрагивает
 * только текст внутри готовых строк — вёрстка не пересобирается.
 */
export default function LeaderboardPage() {
  const load = useCallback(async (): Promise<BoardData> => {
    const [board, stats] = await Promise.all([
      getLeaderboard(LEADERBOARD_SIZE),
      getStats(),
    ]);
    return { rows: board.rows, visitors: stats.totalVisitors };
  }, []);

  const { data, stale } = usePolled(load, 10_000);

  return (
    <main className="screen flex h-dvh cursor-none flex-col overflow-hidden no-select">
      <LeaderboardHeader />

      <div className="min-h-0 flex-1 px-[3vw]">
        <LeaderboardRows rows={data?.rows ?? []} />
      </div>

      <LeaderboardFooter visitors={data?.visitors ?? null} stale={stale} />
    </main>
  );
}
