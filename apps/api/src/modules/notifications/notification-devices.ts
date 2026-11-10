/**
 * Pure rules for the push-device registry.
 *
 * Kept free of Nest and Prisma imports, like `notification-rules.ts`, so the
 * decisions are testable without a container or a database.
 */

/** A push token as Expo issues it, or the opaque form some proxies use. */
export function isValidPushToken(token: unknown): token is string {
  if (typeof token !== 'string') return false;
  const trimmed = token.trim();
  if (trimmed.length < 20 || trimmed.length > 200) return false;
  return /^[A-Za-z0-9[\]_-]+$/.test(trimmed);
}

/** Normalise the platform string, or return null when it is not one we know. */
export function normalizePlatform(platform: unknown): 'ios' | 'android' | 'web' | null {
  if (typeof platform !== 'string') return null;
  const value = platform.trim().toLowerCase();
  return value === 'ios' || value === 'android' || value === 'web' ? value : null;
}

export interface PushDeviceRow {
  token: string;
  createdAt: Date;
  revokedAt: Date | null;
}

/**
 * The tokens worth sending to: live ones, oldest install first so the ordering
 * is stable across deliveries. A revoked token is never resurrected here — only
 * an explicit re-registration does that.
 */
export function selectLiveTokens(rows: readonly PushDeviceRow[]): string[] {
  return rows
    .filter((row) => row.revokedAt === null)
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((row) => row.token);
}
