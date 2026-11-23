'use client';

import React, { useEffect } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { cn } from '../../lib/cn';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!isOpen || busy) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, busy, onCancel]);

  if (!isOpen) return null;

  const isDanger = variant === 'danger';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4 dark:bg-black/70"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        className="animate-dialog-in pb-safe w-full max-w-md rounded-t-3xl border border-zinc-200/90 bg-white p-6 shadow-2xl sm:rounded-2xl dark:border-zinc-800 dark:bg-[#161920]"
      >
        <div className="flex items-start gap-3.5">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
              isDanger
                ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-200/60 dark:bg-rose-950/60 dark:text-rose-400 dark:ring-rose-800/60'
                : 'bg-zinc-100 text-zinc-900 ring-1 ring-zinc-200/70 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700/70',
            )}
          >
            {isDanger ? (
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Info className="h-5 w-5" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 id="confirm-dialog-title" className="text-base font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
              {title}
            </h3>
            <p
              id="confirm-dialog-description"
              className="mt-1.5 text-xs leading-relaxed text-zinc-600 text-pretty dark:text-zinc-400"
            >
              {description}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 active:scale-[0.98] disabled:opacity-50 sm:w-auto sm:py-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              'w-full rounded-xl px-4 py-2.5 text-xs font-bold text-white shadow-xs transition active:scale-[0.98] disabled:opacity-50 sm:w-auto sm:py-2',
              isDanger
                ? 'bg-rose-600 hover:bg-rose-700 dark:bg-rose-500 dark:text-zinc-950 dark:hover:bg-rose-400'
                : 'bg-zinc-950 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white',
            )}
          >
            {busy ? 'Processing…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
