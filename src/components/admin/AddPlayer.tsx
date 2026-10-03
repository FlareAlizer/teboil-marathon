'use client';

import { useState } from 'react';
import type { PlayerSummary } from '@/lib/types';
import { errorText } from './admin-api';
import { createPlayerManually } from './endpoints';

/* ------------------------ Участник без юзернейма -------------------------- */

/**
 * Заводит участника вручную. На киоске требуется настоящий телеграм-юзернейм,
 * а он есть не у всех — без этого обхода такой человек не смог бы играть.
 */
export function AddPlayer({ onCreated }: { onCreated: (p: PlayerSummary) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-tap w-full rounded-btn border-2 border-dashed border-teboil-line font-display text-kiosk-sm font-black uppercase tracking-wide text-teboil-muted active:text-teboil-red"
      >
        + Участник без юзернейма
      </button>
    );
  }

  async function submit() {
    const value = name.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      onCreated(await createPlayerManually(value));
      setOpen(false);
      setName('');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-card border-2 border-teboil-line bg-white/5 p-4">
      <p className="font-display text-kiosk-sm font-black uppercase tracking-wide text-teboil-muted">
        Новый участник
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit();
        }}
        placeholder="Имя или номер телефона"
        aria-label="Имя участника"
        autoComplete="off"
        className="min-h-tap-lg w-full rounded-btn border-2 border-teboil-line bg-teboil-ink px-4 text-kiosk-base text-teboil-black placeholder:text-teboil-muted/60 focus:border-teboil-red focus:outline-none"
      />
      <p className="text-kiosk-sm leading-snug text-teboil-muted">
        Запишите так, чтобы вы сами узнали человека при выдаче приза.
      </p>
      {error && <p className="text-kiosk-sm font-bold text-teboil-red">{error}</p>}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-tap flex-1 rounded-btn border-2 border-teboil-line font-display text-kiosk-sm font-black uppercase text-teboil-black active:bg-white/10"
        >
          Отмена
        </button>
        <button
          type="button"
          disabled={name.trim().length < 2 || busy}
          onClick={() => void submit()}
          className="min-h-tap flex-1 rounded-btn bg-teboil-red font-display text-kiosk-sm font-black uppercase text-white disabled:opacity-40"
        >
          {busy ? '…' : 'Завести'}
        </button>
      </div>
    </div>
  );
}
