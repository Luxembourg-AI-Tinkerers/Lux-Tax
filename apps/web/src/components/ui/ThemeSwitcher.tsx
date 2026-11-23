'use client';

import React, { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '../../lib/cn';
import { type ThemeMode, useTheme } from '../../lib/theme-context';

interface ThemeSwitcherProps {
  variant?: 'segmented' | 'icon';
  className?: string;
}

const OPTIONS: ReadonlyArray<{
  value: ThemeMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'dark', label: 'Dark', icon: Moon },
];

export function ThemeSwitcher({ variant = 'segmented', className }: ThemeSwitcherProps) {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeResolved = mounted ? resolvedTheme : 'light';
  const activeMode = mounted ? theme : 'system';

  if (variant === 'icon') {
    const isDark = activeResolved === 'dark';
    const nextLabel = isDark ? 'Switch to light theme' : 'Switch to dark theme';
    return (
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={nextLabel}
        title={nextLabel}
        className={cn(
          'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200/90 bg-white text-zinc-600 shadow-2xs transition hover:bg-zinc-50 hover:text-zinc-950 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:border-zinc-700/80 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50',
          className,
        )}
      >
        {isDark ? (
          <Sun className="h-4 w-4 text-amber-400" aria-hidden="true" />
        ) : (
          <Moon className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Color theme"
      className={cn(
        'inline-grid grid-cols-3 items-center rounded-xl border border-zinc-200/90 bg-zinc-100/85 p-0.5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900/90',
        className,
      )}
    >
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const selected = activeMode === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            aria-pressed={selected}
            aria-label={`${option.label} theme`}
            title={`${option.label} theme`}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600',
              selected
                ? 'bg-white text-zinc-950 shadow-2xs dark:bg-zinc-800 dark:text-zinc-50 dark:ring-1 dark:ring-zinc-700/80'
                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200',
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
