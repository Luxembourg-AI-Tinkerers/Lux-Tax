'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  NotificationDto,
  NotificationListDto,
  NotificationPreferenceDto,
  NotificationSeverity,
  NotificationType,
  UpdateNotificationPreferencesDto,
} from '@luxtax/contracts';
import { apiClient } from '../lib/api';

const POLL_INTERVAL_MS = 60_000;
const VISIBLE_LIMIT = 20;

const SEVERITY_DOT: Record<NotificationSeverity, string> = {
  [NotificationSeverity.INFO]: 'bg-sky-500',
  [NotificationSeverity.WARNING]: 'bg-amber-500',
  [NotificationSeverity.CRITICAL]: 'bg-rose-500',
};

const MUTE_OPTIONS: ReadonlyArray<{ type: NotificationType; label: string; hint: string }> = [
  {
    type: NotificationType.MATERIAL_FIELD_CHANGED,
    label: 'Material field changes',
    hint: 'A confirmed figure was edited after review.',
  },
  {
    type: NotificationType.DEADLINE_REMINDER,
    label: 'Deadline reminders',
    hint: 'Upcoming filing and payment deadlines.',
  },
];

type PreferenceFeedback = { type: 'success' | 'error'; message: string };

/** Compact relative age used in the notification list. */
export function notificationAge(createdAt: string, now: number = Date.now()): string {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return '';
  const minutes = Math.floor(Math.max(0, now - created) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

interface NotificationCenterProps {
  workspaceId: string;
}

export function NotificationCenter({ workspaceId }: NotificationCenterProps) {
  const router = useRouter();
  const params = useParams<{ householdId?: string }>();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeWorkspaceRef = useRef(workspaceId);

  const [items, setItems] = useState<NotificationDto[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferenceDto | null>(null);
  const [showPreferences, setShowPreferences] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [preferenceFeedback, setPreferenceFeedback] = useState<PreferenceFeedback | null>(null);

  const applyListResult = useCallback((res: { data?: NotificationListDto; error?: string }) => {
    if (res.data) {
      setItems(res.data.items);
      setUnreadCount(res.data.unreadCount);
      setError(null);
      return;
    }
    setError(res.error ?? 'Notifications could not be loaded.');
  }, []);

  // Keep the guard ref in step with the rendered workspace.
  useEffect(() => {
    activeWorkspaceRef.current = workspaceId;
  }, [workspaceId]);

  // Initial load, poll every 60 s, and reset when the workspace changes.
  useEffect(() => {
    let cancelled = false;

    setItems([]);
    setUnreadCount(0);
    setOpen(false);
    setLoading(true);
    setError(null);
    setPreferences(null);
    setShowPreferences(false);
    setPreferenceFeedback(null);

    const load = async (silent: boolean) => {
      if (!silent) setLoading(true);
      const res = await apiClient.getNotifications(workspaceId);
      if (cancelled) return;
      applyListResult(res);
      if (!silent) setLoading(false);
    };

    void load(false);
    const timer = window.setInterval(() => {
      void load(true);
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [workspaceId, applyListResult]);

  // Close the dropdown on outside click or Escape.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const refresh = useCallback(async () => {
    const requested = workspaceId;
    const res = await apiClient.getNotifications(requested);
    if (activeWorkspaceRef.current !== requested) return;
    applyListResult(res);
  }, [workspaceId, applyListResult]);

  const handleToggleOpen = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setPreferenceFeedback(null);
    void refresh();
  };

  const handleItemClick = async (item: NotificationDto) => {
    if (!item.isRead) {
      const res = await apiClient.markNotificationRead(workspaceId, item.id);
      if (res.error) {
        // Keep the item unread but still follow its destination.
        setError(res.error);
      } else {
        setItems((prev) =>
          prev.map((entry) =>
            entry.id === item.id
              ? { ...entry, isRead: true, readAt: new Date().toISOString() }
              : entry,
          ),
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
        setError(null);
      }
    }

    if (item.actionUrl) {
      setOpen(false);
      router.push(resolveActionUrl(item.actionUrl));
    }
  };

  const handleMarkAllRead = async () => {
    const res = await apiClient.markAllNotificationsRead(workspaceId);
    if (res.error) {
      setError(res.error);
      return;
    }

    const readAt = new Date().toISOString();
    setItems((prev) => prev.map((entry) => (entry.isRead ? entry : { ...entry, isRead: true, readAt })));
    setUnreadCount(0);
    setError(null);
  };

  const handleTogglePreferences = async () => {
    if (showPreferences) {
      setShowPreferences(false);
      return;
    }

    setShowPreferences(true);
    setPreferenceFeedback(null);
    if (preferences) return;

    const requestedWorkspace = workspaceId;
    const res = await apiClient.getNotificationPreferences(requestedWorkspace);
    // A response that lands after a workspace switch belongs to the previous
    // household; showing (and then saving) it under the new one would write the
    // wrong preferences.
    if (activeWorkspaceRef.current !== requestedWorkspace) return;
    if (res.data) {
      setPreferences(res.data);
    } else {
      setError(res.error ?? 'Notification preferences could not be loaded.');
    }
  };

  const updatePreference = (patch: Partial<UpdateNotificationPreferencesDto>) => {
    setPreferences((prev) => (prev ? { ...prev, ...patch } : prev));
    setPreferenceFeedback(null);
  };

  const toggleMutedType = (type: NotificationType) => {
    setPreferences((prev) => {
      if (!prev) return prev;
      const muted = new Set<NotificationType>(prev.mutedTypes);
      if (muted.has(type)) {
        muted.delete(type);
      } else {
        muted.add(type);
      }
      // Keep every other muted type the API returned.
      return { ...prev, mutedTypes: Array.from(muted) };
    });
    setPreferenceFeedback(null);
  };

  const handleSavePreferences = async () => {
    if (!preferences || savingPrefs) return;

    setSavingPrefs(true);
    setPreferenceFeedback(null);
    const body: UpdateNotificationPreferencesDto = {
      emailEnabled: preferences.emailEnabled,
      pushEnabled: preferences.pushEnabled,
      mutedTypes: preferences.mutedTypes,
    };
    const requestedWorkspace = workspaceId;
    const res = await apiClient.updateNotificationPreferences(requestedWorkspace, body);
    if (activeWorkspaceRef.current !== requestedWorkspace) {
      setSavingPrefs(false);
      return;
    }

    if (res.data) {
      setPreferences(res.data);
      setPreferenceFeedback({ type: 'success', message: 'Preferences saved.' });
    } else {
      setPreferenceFeedback({ type: 'error', message: res.error ?? 'Preferences could not be saved.' });
    }
    setSavingPrefs(false);
  };

  const visibleItems = items.slice(0, VISIBLE_LIMIT);
  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount);

  /**
   * The API hooks currently emit `/dashboard`, while the dashboard route is
   * `/[householdId]/dashboard`; resolve that one shape so the link does not 404.
   */
  const resolveActionUrl = (actionUrl: string): string => {
    if (actionUrl === '/dashboard' && params?.householdId) {
      return `/${params.householdId}/dashboard`;
    }
    return actionUrl;
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={handleToggleOpen}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-haspopup="true"
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-[16px] rounded-full bg-rose-500 px-1 text-center text-[10px] font-bold leading-4 text-white">
            {badgeLabel}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-xs font-bold text-slate-900">Notifications</p>
              <p className="text-[10px] text-slate-400">
                {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-[10px] font-semibold text-sky-600 hover:text-sky-700"
                >
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={handleTogglePreferences}
                aria-pressed={showPreferences}
                className={`rounded-md px-2 py-1 text-[10px] font-semibold transition ${
                  showPreferences
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Preferences
              </button>
            </div>
          </div>

          {error && (
            <p className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-[11px] text-rose-700">
              {error}
            </p>
          )}

          {showPreferences ? (
            <div className="max-h-[420px] space-y-3 overflow-y-auto px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-slate-700">Notification preferences</p>
                <button
                  type="button"
                  onClick={() => setShowPreferences(false)}
                  className="text-[10px] font-semibold text-slate-500 hover:text-slate-800"
                >
                  Back
                </button>
              </div>

              <p className="text-[10px] leading-snug text-slate-400">
                Email and push are stored as preferences only — no message is delivered through those
                channels yet.
              </p>

              {!preferences ? (
                <p className="py-4 text-center text-[11px] text-slate-400">
                  {error ? 'Preferences unavailable.' : 'Loading preferences…'}
                </p>
              ) : (
                <>
                  <label className="flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50/60 p-2.5">
                    <input
                      type="checkbox"
                      checked={preferences.emailEnabled}
                      onChange={(e) => updatePreference({ emailEnabled: e.target.checked })}
                      className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-sky-600"
                    />
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold text-slate-700">
                        Email notifications
                      </span>
                      <span className="block text-[10px] text-slate-400">
                        Preference only; email delivery is not implemented.
                      </span>
                    </span>
                  </label>

                  <label className="flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50/60 p-2.5">
                    <input
                      type="checkbox"
                      checked={preferences.pushEnabled}
                      onChange={(e) => updatePreference({ pushEnabled: e.target.checked })}
                      className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-sky-600"
                    />
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold text-slate-700">
                        Push notifications
                      </span>
                      <span className="block text-[10px] text-slate-400">
                        Preference only; push delivery is not implemented.
                      </span>
                    </span>
                  </label>

                  <div className="space-y-2 pt-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Mute notification types
                    </p>
                    {MUTE_OPTIONS.map((option) => (
                      <label key={option.type} className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={preferences.mutedTypes.includes(option.type)}
                          onChange={() => toggleMutedType(option.type)}
                          className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-sky-600"
                        />
                        <span className="min-w-0">
                          <span className="block text-[11px] font-semibold text-slate-700">
                            {option.label}
                          </span>
                          <span className="block text-[10px] text-slate-400">{option.hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span
                      aria-live="polite"
                      className={`text-[10px] ${
                        preferenceFeedback?.type === 'success' ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {preferenceFeedback?.message ?? ''}
                    </span>
                    <button
                      type="button"
                      onClick={handleSavePreferences}
                      disabled={savingPrefs}
                      className="rounded-lg bg-sky-600 px-3 py-1.5 text-[10px] font-bold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingPrefs ? 'Saving…' : 'Save preferences'}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              {loading && items.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-slate-400">Loading notifications…</p>
              ) : visibleItems.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-xs font-semibold text-slate-600">No notifications yet</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Updates about your return will appear here.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {visibleItems.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleItemClick(item)}
                        className={`flex w-full items-start gap-2.5 px-4 py-3 text-left transition hover:bg-slate-50 ${
                          item.isRead ? 'bg-white' : 'bg-sky-50/60'
                        }`}
                      >
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                            SEVERITY_DOT[item.severity] ?? 'bg-slate-300'
                          }`}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span
                              className={`truncate text-xs ${
                                item.isRead ? 'font-semibold text-slate-700' : 'font-bold text-slate-900'
                              }`}
                            >
                              {item.title}
                            </span>
                            <span className="shrink-0 text-[10px] text-slate-400">
                              {notificationAge(item.createdAt)}
                            </span>
                          </span>
                          <span className="mt-0.5 block line-clamp-2 text-[11px] leading-snug text-slate-500">
                            {item.body}
                          </span>
                          <span className="sr-only">{item.severity} severity</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
