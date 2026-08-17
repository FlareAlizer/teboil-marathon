'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { adminLogin, errorText } from './admin-api';

/**
 * Вход оператора. Показывается и при первом открытии админки, и в момент,
 * когда истекла сессия — во втором случае с пояснением, чтобы оператор не
 * решил, что стенд сломался.
 */
export function LoginForm({
  expired = false,
  onSuccess,
}: {
  expired?: boolean;
  onSuccess: () => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || password.length === 0) return;

    setBusy(true);
    setError(null);
    try {
      await adminLogin(password);
      setPassword('');
      onSuccess();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen-dark flex min-h-dvh flex-col items-center justify-center safe-p">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="slogan-bar text-kiosk-sm">Заправляем в спорте</span>
          <h1 className="mt-5 font-display text-display-sm">
            Панель <span className="display-accent">оператора</span>
          </h1>
        </div>

        <form onSubmit={submit} className="surface-card p-6">
          {expired && (
            <p className="mb-5 rounded-btn border border-teboil-red/50 bg-teboil-red/10 p-4 text-kiosk-sm text-white">
              Сессия истекла. Введите пароль ещё раз — все данные на месте.
            </p>
          )}

          <Input
            label="Пароль"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error}
            placeholder="••••••"
            autoFocus
            autoComplete="current-password"
            enterKeyHint="go"
          />

          <Button
            type="submit"
            size="lg"
            fullWidth
            loading={busy}
            disabled={password.length === 0}
            className="mt-6"
          >
            Войти
          </Button>
        </form>
      </div>
    </main>
  );
}
