/**
 * Notification outbox policy — pure, dependency-free and unit-testable.
 *
 * One delivery row exists per notification and channel. The worker claims due
 * rows, calls the adapter and reschedules failures with exponential backoff
 * until the attempt budget is exhausted (dead letter, status FAILED).
 */

export type DeliveryChannel = 'EMAIL' | 'PUSH';

export type DeliveryStatus = 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'SKIPPED';

/** Total attempts per delivery, including the first one. */
export const MAX_DELIVERY_ATTEMPTS = 5;

/** First retry waits one minute. */
export const BASE_BACKOFF_MS = 60_000;

/** Backoff is capped at one hour, however many attempts remain. */
export const MAX_BACKOFF_MS = 60 * 60_000;

/**
 * Delay before the next attempt after `attempts` failures.
 * Sequence: 1 min, 5 min, 25 min, 1 h, 1 h (capped).
 */
export function backoffDelayMs(attempts: number): number {
  const failures = Math.max(0, Math.floor(Number.isFinite(attempts) ? attempts : 0));
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 5 ** failures);
}

/** When the next attempt is due, after `attempts` failures. */
export function nextAttemptAt(attempts: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + backoffDelayMs(attempts));
}

/** False once the attempt budget is spent: the row becomes FAILED. */
export function isRetryable(attemptsAfterFailure: number): boolean {
  return (
    Number.isFinite(attemptsAfterFailure) &&
    attemptsAfterFailure > 0 &&
    attemptsAfterFailure < MAX_DELIVERY_ATTEMPTS
  );
}

export interface ChannelPreference {
  emailEnabled: boolean;
  pushEnabled: boolean;
}

/**
 * Channels to enqueue for one recipient.
 *
 * A missing preference row means the defaults (both channels on), matching
 * `defaultNotificationPreference`. A security alert ignores preferences: a
 * compromised session must not be able to silence the notice that reports it —
 * the same rule the preferences API enforces.
 */
export function channelsForNotification(
  preference: ChannelPreference | null | undefined,
  type: string,
): DeliveryChannel[] {
  if (type === 'SECURITY_ALERT') return ['EMAIL', 'PUSH'];
  const prefs = preference ?? { emailEnabled: true, pushEnabled: true };
  const channels: DeliveryChannel[] = [];
  if (prefs.emailEnabled) channels.push('EMAIL');
  if (prefs.pushEnabled) channels.push('PUSH');
  return channels;
}

/**
 * A row left in SENDING longer than this is presumed orphaned by a crashed
 * worker and may be claimed again. Without it, a crash between claim and send
 * would strand the delivery forever.
 */
export const STALE_CLAIM_MS = 10 * 60_000;

/** Rows claimed before this instant are reclaimable. */
export function staleClaimCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - STALE_CLAIM_MS);
}

/** Default forward window for an objection-deadline reminder. */
export const REMINDER_WINDOW_DAYS = 30;

/**
 * True when a deadline is still in the future and inside the reminder window.
 * A deadline that has already passed is never reminded: the objection window
 * is closed, and a late nudge would be misleading.
 */
export function isWithinReminderWindow(
  deadline: Date,
  now: Date = new Date(),
  days: number = REMINDER_WINDOW_DAYS,
): boolean {
  const delta = deadline.getTime() - now.getTime();
  return delta >= 0 && delta <= Math.max(0, days) * 24 * 60 * 60_000;
}

/**
 * A delivery is due when it is PENDING and its scheduled time has passed.
 * Kept as a function so the worker and its tests agree on one definition.
 */
export function isDue(
  status: DeliveryStatus,
  nextAttemptAtValue: Date,
  now: Date = new Date(),
): boolean {
  return status === 'PENDING' && nextAttemptAtValue.getTime() <= now.getTime();
}
