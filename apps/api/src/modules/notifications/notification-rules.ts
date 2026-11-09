import type { NotificationPreferenceDto } from '@luxtax/contracts';

/**
 * Delivery decision for ordinary notifications. Kept free of Nest/Prisma so it
 * can be unit-tested and reused by any future channel (email, push, in-app).
 *
 * Security alerts are deliberately not special-cased here: the preference table
 * only stores ordinary types, and API-4 wires no preference filter on the
 * security path.
 */
export interface NotificationPreferenceScope {
  readonly mutedTypes: readonly string[];
}

/** False only when the recipient explicitly muted this type. */
export function shouldDeliverNotification(
  pref: NotificationPreferenceScope | null | undefined,
  type: string,
): boolean {
  if (!pref) return true;
  return !pref.mutedTypes.includes(type);
}

/** Defaults shown before a user has ever saved notification preferences. */
export function defaultNotificationPreference(
  householdId: string,
  userId: string,
): NotificationPreferenceDto {
  return {
    userId,
    householdId,
    emailEnabled: true,
    pushEnabled: true,
    mutedTypes: [],
  };
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Compact relative age used by notification lists. Future timestamps clamp to
 * "just now" so clock skew never renders a negative age.
 */
export function notificationAge(createdAt: string, now: Date): string {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return 'unknown';

  const elapsed = Math.max(0, now.getTime() - created);
  if (elapsed < MINUTE_MS) return 'just now';
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)} min ago`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)} h ago`;
  return `${Math.floor(elapsed / DAY_MS)} d ago`;
}
