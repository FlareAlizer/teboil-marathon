'use client';

import { useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface ModalProps {
  open: boolean;
  onClose?: () => void;
  title?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Полноэкранный режим — для игровых оверлеев на планшете. */
  fullscreen?: boolean;
  /** Запретить закрытие по фону и Esc (например, во время начисления баллов). */
  dismissible?: boolean;
  className?: string;
}

/** Модальное окно поверх игрового экрана. */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  fullscreen = false,
  dismissible = true,
  className,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, dismissible, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={dismissible ? onClose : undefined}
      />
      <div
        className={cn(
          'relative z-10 w-full animate-pop-in overflow-y-auto rounded-card border-4 border-teboil-red bg-white text-teboil-black shadow-card',
          fullscreen ? 'h-full max-w-none' : 'max-h-[90dvh] max-w-2xl',
          className,
        )}
      >
        {title && (
          <div className="border-b-2 border-teboil-line p-6 sm:p-8">
            <h2 className="font-display text-kiosk-xl font-bold leading-tight">
              {title}
            </h2>
          </div>
        )}
        <div className="p-6 sm:p-8">{children}</div>
        {footer && (
          <div className="flex flex-wrap gap-4 border-t-2 border-teboil-line p-6 sm:p-8">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
