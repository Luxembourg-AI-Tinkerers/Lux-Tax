'use client';

import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '../../lib/cn';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  type: ToastType;
  message: string;
}

interface ToastBannerProps {
  feedback: ToastMessage | null;
  onDismiss: () => void;
  action?: React.ReactNode;
  className?: string;
}

const TONE_MAP: Record<ToastType, { container: string; icon: React.ReactNode; role: 'alert' | 'status' }> = {
  success: {
    container: 'border-emerald-200/90 bg-emerald-50 text-emerald-900',
    icon: <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />,
    role: 'status',
  },
  error: {
    container: 'border-rose-200/90 bg-rose-50 text-rose-900',
    icon: <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />,
    role: 'alert',
  },
  warning: {
    container: 'border-amber-200/90 bg-amber-50 text-amber-900',
    icon: <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />,
    role: 'status',
  },
  info: {
    container: 'border-sky-200/90 bg-sky-50 text-sky-900',
    icon: <Info className="h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />,
    role: 'status',
  },
};

export function ToastBanner({ feedback, onDismiss, action, className }: ToastBannerProps) {
  if (!feedback) return null;
  const tone = TONE_MAP[feedback.type];

  return (
    <div
      role={tone.role}
      aria-live={tone.role === 'alert' ? 'assertive' : 'polite'}
      className={cn(
        'no-print animate-ui-in flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-xs',
        tone.container,
        className,
      )}
    >
      <div className="flex items-start gap-2.5 min-w-0 flex-1">
        <span className="mt-0.5">{tone.icon}</span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
          <span className="text-pretty leading-snug">{feedback.message}</span>
          {action}
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-current/60 transition hover:bg-black/5 hover:text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
