'use client';

import React from 'react';
import { cn } from '../../lib/cn';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'indigo';

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral:
    'bg-zinc-100 text-zinc-700 border-zinc-200/80 dark:bg-zinc-800/90 dark:text-zinc-300 dark:border-zinc-700/80',
  info: 'bg-sky-50 text-sky-800 border-sky-200/80 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800/60',
  success:
    'bg-emerald-50 text-emerald-800 border-emerald-200/80 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60',
  warning:
    'bg-amber-50 text-amber-800 border-amber-200/80 dark:bg-amber-950/55 dark:text-amber-300 dark:border-amber-800/60',
  danger:
    'bg-rose-50 text-rose-800 border-rose-200/80 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/60',
  indigo:
    'bg-zinc-900 text-zinc-50 border-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:border-zinc-200',
};

interface StatusBadgeProps {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}

export function StatusBadge({ tone = 'neutral', children, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-4 whitespace-nowrap',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
