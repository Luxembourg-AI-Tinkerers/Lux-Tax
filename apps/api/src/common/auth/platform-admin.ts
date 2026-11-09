/**
 * Platform-administrator allowlist.
 *
 * Dependency-free on purpose: the parsing and the match are unit-tested
 * without Nest, Prisma or a database. The allowlist is operator-managed
 * configuration (`ADMIN_EMAILS`, comma-separated), never user input.
 *
 * Matching is exact after trimming and lower-casing: a look-alike address such
 * as `admin@luxtax.lu.attacker.example` or `notadmin@luxtax.lu` must not pass.
 */

/** Split `ADMIN_EMAILS` into a normalised allowlist; empty entries are dropped. */
export function parseAdminEmails(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

/** True only for an exact, case-insensitive match against a normalised allowlist. */
export function isPlatformAdminEmail(email: string, allowlist: string[]): boolean {
  const candidate = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (candidate.length === 0) return false;
  return allowlist.some((allowed) => allowed.trim().toLowerCase() === candidate);
}
