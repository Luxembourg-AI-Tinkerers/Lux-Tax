/**
 * Audit chain (API-10).
 *
 * The audit trail was append-only by convention only: any process with database
 * access could rewrite or delete a row, and nothing tied one entry to the next.
 *
 * Two defences are added:
 *  1. a hash chain — each event stores `prevHash` (the previous event's `hash` for
 *     the same household) and `hash`, computed over a canonical form of the event;
 *  2. a database trigger that rejects UPDATE and DELETE on `audit_events`.
 *
 * Together they make tampering *detectable* (chain verification) and *prevented*
 * (trigger). The chain is per household, because that is the tenant boundary a
 * reviewer reads as one narrative.
 */
import { createHash } from 'node:crypto';

/** Audit event taxonomy: every event type maps to exactly one category. */
export type AuditCategory =
  | 'AUTH'
  | 'HOUSEHOLD'
  | 'DOCUMENT'
  | 'FACT'
  | 'CALCULATION'
  | 'FILING'
  | 'ADMIN';

const CATEGORY_BY_PREFIX: ReadonlyArray<readonly [string, AuditCategory]> = [
  ['USER_', 'AUTH'],
  ['HOUSEHOLD_', 'HOUSEHOLD'],
  ['MEMBER_', 'HOUSEHOLD'],
  ['DOCUMENT_', 'DOCUMENT'],
  ['FACT_', 'FACT'],
  ['TAX_', 'CALCULATION'],
  ['RETURN_', 'FILING'],
  ['APPROVAL_', 'FILING'],
  ['FILING_', 'FILING'],
  ['ASSESSMENT_', 'FILING'],
  ['WORKSPACE_', 'HOUSEHOLD'],
];

/**
 * Category of an audit event. Unknown types fall back to `ADMIN` rather than
 * throwing: a new event type must never break logging.
 */
export function auditCategory(eventType: string): AuditCategory {
  for (const [prefix, category] of CATEGORY_BY_PREFIX) {
    if (eventType.startsWith(prefix)) return category;
  }
  return 'ADMIN';
}

export interface AuditChainEntry {
  id: string;
  householdId?: string | null;
  workspaceId?: string | null;
  actorId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  description: string;
  createdAt: string;
  previousValue?: unknown;
  newValue?: unknown;
  prevHash?: string | null;
  hash?: string | null;
}

/** Deterministic JSON: keys sorted at every depth. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) sorted[key] = sortValue(source[key]);
    return sorted;
  }
  return value;
}

/**
 * Hash of one event, chained to its predecessor.
 *
 * `id` and `createdAt` are part of the payload, so two otherwise identical events
 * at different times cannot produce the same hash.
 */
export function hashAuditEvent(prevHash: string | null, entry: Omit<AuditChainEntry, 'prevHash' | 'hash'>): string {
  const payload = {
    prevHash: prevHash ?? '',
    id: entry.id,
    householdId: entry.householdId ?? null,
    workspaceId: entry.workspaceId ?? null,
    actorId: entry.actorId,
    eventType: entry.eventType,
    entityType: entry.entityType,
    entityId: entry.entityId,
    description: entry.description,
    createdAt: entry.createdAt,
    previousValue: entry.previousValue ?? null,
    newValue: entry.newValue ?? null,
  };
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

export type ChainVerification = { valid: true } | { valid: false; brokenAt: string; reason: string };

/**
 * Verifies a chain ordered oldest → newest.
 *
 * Detects: a modified event (its hash no longer matches), a deleted event (the
 * following `prevHash` no longer matches), and a re-ordered pair.
 */
export function verifyAuditChain(entries: readonly AuditChainEntry[]): ChainVerification {
  let previousHash: string | null = null;

  for (const entry of entries) {
    const expectedPrev = entry.prevHash ?? null;
    if ((expectedPrev ?? null) !== (previousHash ?? null)) {
      return {
        valid: false,
        brokenAt: entry.id,
        reason: `prevHash mismatch: expected ${previousHash ?? 'null'}, found ${expectedPrev ?? 'null'}`,
      };
    }

    const recomputed = hashAuditEvent(previousHash, entry);
    if (!entry.hash || entry.hash !== recomputed) {
      return {
        valid: false,
        brokenAt: entry.id,
        reason: 'event hash does not match its content',
      };
    }

    previousHash = entry.hash;
  }

  return { valid: true };
}
