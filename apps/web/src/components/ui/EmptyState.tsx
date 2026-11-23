'use client';

import React from 'react';
import { cn } from '../../lib/cn';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actions?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actions,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-12 text-center',
        className,
      )}
    >
      <div className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-200/80 bg-zinc-50 text-zinc-600 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        {icon}
      </div>
      <h4 className="text-sm font-bold text-zinc-950 text-balance dark:text-zinc-50">{title}</h4>
      <p className="mt-1.5 max-w-md text-xs leading-relaxed text-zinc-500 text-pretty dark:text-zinc-400">
        {description}
      </p>
      {actions && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          {actions}
        </div>
      )}
    </div>
  );
}
