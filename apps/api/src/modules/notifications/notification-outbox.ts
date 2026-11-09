import type { DeliveryAdapter } from './adapters/delivery-adapter';
import {
  isRetryable,
  nextAttemptAt,
  staleClaimCutoff,
  type DeliveryChannel,
} from './notification-delivery';

/** One claimed-able delivery row, with what an adapter is allowed to see. */
export interface OutboxDeliveryRow {
  id: string;
  notificationId: string;
  channel: string;
  attempts: number;
  notification: {
    userId: string;
    type: string;
    severity: string;
    title: string;
    body: string;
    user: { email: string | null } | null;
  };
}

/**
 * The persistence operations the pass needs. Implemented over Prisma by the
 * service, and by an in-memory double in tests, so the retry logic is executed
 * rather than described.
 */
export interface OutboxStore {
  findDue(limit: number, now: Date): Promise<OutboxDeliveryRow[]>;
  /**
   * Returns false when another worker holds a fresh claim. A claim older than
   * `staleBefore` is presumed orphaned and may be taken over.
   */
  claim(id: string, staleBefore: Date): Promise<boolean>;
  markSent(id: string, sentAt: Date): Promise<void>;
  markSkipped(id: string, reason: string): Promise<void>;
  markRetry(id: string, attempts: number, error: string, next: Date): Promise<void>;
  markFailed(id: string, attempts: number, error: string): Promise<void>;
}

export interface OutboxRunResult {
  scanned: number;
  sent: number;
  retried: number;
  failed: number;
  skipped: number;
}

const emptyResult = (): OutboxRunResult => ({
  scanned: 0,
  sent: 0,
  retried: 0,
  failed: 0,
  skipped: 0,
});

/**
 * One dispatch pass. Dependency-free and total: a broken adapter is recorded on
 * the row, never thrown at the caller.
 */
export async function runOutboxPass(
  store: OutboxStore,
  adapters: readonly DeliveryAdapter[],
  limit = 25,
  now: Date = new Date(),
): Promise<OutboxRunResult> {
  const result = emptyResult();
  const byChannel = new Map<DeliveryChannel, DeliveryAdapter>(
    adapters.map((adapter) => [adapter.channel, adapter]),
  );

  const due = await store.findDue(Math.min(Math.max(limit, 1), 100), now);
  result.scanned = due.length;

  const staleBefore = staleClaimCutoff(now);
  for (const row of due) {
    if (!(await store.claim(row.id, staleBefore))) continue;

    const adapter = byChannel.get(row.channel as DeliveryChannel);
    if (!adapter) {
      await store.markSkipped(row.id, `${row.channel}: no adapter registered`);
      result.skipped += 1;
      continue;
    }

    try {
      if (!adapter.isConfigured()) {
        await store.markSkipped(row.id, `${adapter.channel}: no transport configured`);
        result.skipped += 1;
        continue;
      }

      await adapter.send({
        notificationId: row.notificationId,
        userId: row.notification.userId,
        email: row.notification.user?.email ?? null,
        type: row.notification.type,
        severity: row.notification.severity,
        title: row.notification.title,
        body: row.notification.body,
      });
      await store.markSent(row.id, new Date());
      result.sent += 1;
    } catch (error) {
      const attempts = row.attempts + 1;
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);

      if (isRetryable(attempts)) {
        // ttempts counts failures including this one: the first retry waits 1 min,
        // so the delay index is attempts - 1.
        await store.markRetry(row.id, attempts, message, nextAttemptAt(attempts - 1, now));
        result.retried += 1;
      } else {
        await store.markFailed(row.id, attempts, message);
        result.failed += 1;
      }
    }
  }

  return result;
}
