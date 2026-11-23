'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  titleId: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  closeLabel?: string;
  disableEscape?: boolean;
  maxWidthClass?: string;
  children: React.ReactNode;
}

export function Modal({
  isOpen,
  onClose,
  titleId,
  title,
  subtitle,
  icon,
  closeLabel = 'Close dialog',
  disableEscape = false,
  maxWidthClass = 'max-w-lg',
  children,
}: ModalProps) {
  useEffect(() => {
    if (!isOpen || disableEscape) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, disableEscape, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4 dark:bg-black/70"
      onClick={(e) => {
        if (e.target === e.currentTarget && !disableEscape) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'animate-dialog-in pb-safe w-full max-h-[92dvh] overflow-y-auto rounded-t-3xl border border-zinc-200/90 bg-white shadow-2xl sm:max-h-[90dvh] sm:rounded-2xl dark:border-zinc-800 dark:bg-[#161920]',
          maxWidthClass,
        )}
      >
        {/* Subtle handle bar on mobile sheets */}
        <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        </div>

        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-zinc-100 bg-white/95 px-5 py-4 backdrop-blur-xs sm:px-6 dark:border-zinc-800 dark:bg-[#161920]/95">
          <div className="flex items-start gap-3 min-w-0">
            {icon && (
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-900 ring-1 ring-zinc-200/70 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700/70">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h3 id={titleId} className="text-base font-bold tracking-tight text-zinc-950 leading-snug dark:text-zinc-50">
                {title}
              </h3>
              {subtitle && (
                <p className="mt-0.5 text-xs text-zinc-500 leading-relaxed dark:text-zinc-400">{subtitle}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={disableEscape}
            aria-label={closeLabel}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
