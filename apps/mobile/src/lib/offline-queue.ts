/**
 * Offline queue for mobile writes (MOB-3).
 *
 * The mobile app performs three operations that must survive a flaky connection:
 * document upload, tax calculation and return approval. They are workspace-scoped
 * and idempotent enough to retry, so they are queued locally and replayed in order.
 *
 * Everything here is pure: an immutable queue plus explicit `now` values. Storage
 * is a port (`QueueStorage`) and the React Native implementation plugs in later, so
 * the whole policy is unit-testable with no emulator.
 */

export type QueuedOperationKind = 'UPLOAD_DOCUMENT' | 'CALCULATE_TAX' | 'APPROVE_RETURN';

export interface QueuedOperation {
  readonly id: string;
  readonly kind: QueuedOperationKind;
  /** Workspace the operation targets — never a household id (MOB-1). */
  readonly workspaceId: string;
  readonly payload?: unknown;
  /** Collapses duplicate intents (e.g. the same file queued twice). */
  readonly dedupeKey?: string;
  readonly enqueuedAt: number;
  /** Monotonic insertion counter: the tie-breaker when two items share a timestamp. */
  readonly seq: number;
  readonly attempts: number;
  /** Earliest time this operation may be retried. */
  readonly nextAttemptAt: number;
  readonly lastError?: string;
}

export interface QueuePolicy {
  readonly maxItems: number;
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

export const DEFAULT_QUEUE_POLICY: QueuePolicy = {
  maxItems: 50,
  maxAttempts: 5,
  baseDelayMs: 5_000,
  maxDelayMs: 5 * 60_000,
};

export type EnqueueResult =
  | { ok: true; queue: QueuedOperation[]; operation: QueuedOperation }
  | { ok: false; queue: QueuedOperation[]; reason: 'DUPLICATE' | 'FULL' };

export interface EnqueueInput {
  id: string;
  kind: QueuedOperationKind;
  workspaceId: string;
  payload?: unknown;
  dedupeKey?: string;
}

/** Exponential backoff: 5 s, 10 s, 20 s, 40 s … capped. */
export function backoffDelay(attempts: number, policy: QueuePolicy = DEFAULT_QUEUE_POLICY): number {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** exponent);
}

/**
 * Adds an operation. Duplicates (same `dedupeKey` while still pending) and overflow
 * are reported rather than silently dropped, so the UI can tell the user.
 */
export function enqueue(
  queue: readonly QueuedOperation[],
  input: EnqueueInput,
  policy: QueuePolicy = DEFAULT_QUEUE_POLICY,
  now: number = Date.now(),
): EnqueueResult {
  if (input.dedupeKey && queue.some((item) => item.dedupeKey === input.dedupeKey)) {
    return { ok: false, queue: [...queue], reason: 'DUPLICATE' };
  }
  if (queue.length >= policy.maxItems) {
    return { ok: false, queue: [...queue], reason: 'FULL' };
  }

  const nextSeq = queue.reduce((max, item) => Math.max(max, item.seq ?? 0), 0) + 1;

  const operation: QueuedOperation = {
    id: input.id,
    kind: input.kind,
    workspaceId: input.workspaceId,
    payload: input.payload,
    dedupeKey: input.dedupeKey,
    enqueuedAt: now,
    seq: nextSeq,
    attempts: 0,
    nextAttemptAt: now,
  };

  return { ok: true, queue: [...queue, operation], operation };
}

/** Operations whose backoff has elapsed, oldest first (FIFO across kinds). */
export function dueOperations(
  queue: readonly QueuedOperation[],
  now: number = Date.now(),
): QueuedOperation[] {
  return queue
    .filter((item) => item.nextAttemptAt <= now)
    .sort(
      (a, b) =>
        a.enqueuedAt - b.enqueuedAt ||
        (a.seq ?? 0) - (b.seq ?? 0) ||
        a.id.localeCompare(b.id),
    );
}

/** Removes a completed operation. Unknown ids are a no-op, not an error. */
export function markSucceeded(
  queue: readonly QueuedOperation[],
  id: string,
): QueuedOperation[] {
  return queue.filter((item) => item.id !== id);
}

/**
 * Records a failure and schedules the next attempt.
 *
 * Once `maxAttempts` is reached the operation is dropped from the active queue and
 * returned as `deadLettered`, so the caller can surface it instead of retrying for ever.
 */
export function markFailed(
  queue: readonly QueuedOperation[],
  id: string,
  error: string,
  policy: QueuePolicy = DEFAULT_QUEUE_POLICY,
  now: number = Date.now(),
): { queue: QueuedOperation[]; deadLettered?: QueuedOperation } {
  let deadLettered: QueuedOperation | undefined;

  const next = queue.flatMap((item) => {
    if (item.id !== id) return [item];

    const attempts = item.attempts + 1;
    const updated: QueuedOperation = {
      ...item,
      attempts,
      lastError: error,
      nextAttemptAt: now + backoffDelay(attempts, policy),
    };

    if (attempts >= policy.maxAttempts) {
      deadLettered = updated;
      return [];
    }
    return [updated];
  });

  return { queue: next, deadLettered };
}

export interface QueueSummary {
  total: number;
  due: number;
  byKind: Record<QueuedOperationKind, number>;
  oldestAgeMs: number;
  retrying: number;
}

export function summarise(
  queue: readonly QueuedOperation[],
  now: number = Date.now(),
): QueueSummary {
  const byKind: Record<QueuedOperationKind, number> = {
    UPLOAD_DOCUMENT: 0,
    CALCULATE_TAX: 0,
    APPROVE_RETURN: 0,
  };
  let retrying = 0;
  let oldest = now;

  for (const item of queue) {
    byKind[item.kind] += 1;
    if (item.attempts > 0) retrying += 1;
    if (item.enqueuedAt < oldest) oldest = item.enqueuedAt;
  }

  return {
    total: queue.length,
    due: dueOperations(queue, now).length,
    byKind,
    oldestAgeMs: queue.length > 0 ? now - oldest : 0,
    retrying,
  };
}

/** Storage port so the React Native layer stays replaceable and this stays testable. */
export interface QueueStorage {
  load(): Promise<QueuedOperation[]>;
  save(queue: QueuedOperation[]): Promise<void>;
}

export interface DeadLetter {
  operation: QueuedOperation;
  error: string;
  at: number;
}

/**
 * Stateful wrapper: loads once, then applies the pure operations and persists after
 * each mutation. Failures to persist are surfaced, never swallowed — losing the queue
 * silently would be worse than a visible error.
 */
export class OfflineQueue {
  private queue: QueuedOperation[] = [];
  private readonly deadLetters: DeadLetter[] = [];

  constructor(
    private readonly storage: QueueStorage,
    private readonly policy: QueuePolicy = DEFAULT_QUEUE_POLICY,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  async load(): Promise<QueuedOperation[]> {
    this.queue = (await this.storage.load()) ?? [];
    return [...this.queue];
  }

  get items(): readonly QueuedOperation[] {
    return this.queue;
  }

  get deadLettered(): readonly DeadLetter[] {
    return this.deadLetters;
  }

  async enqueue(input: EnqueueInput): Promise<EnqueueResult> {
    const result = enqueue(this.queue, input, this.policy, this.clock());
    if (result.ok) {
      this.queue = result.queue;
      await this.storage.save(this.queue);
    }
    return result;
  }

  async complete(id: string): Promise<void> {
    this.queue = markSucceeded(this.queue, id);
    await this.storage.save(this.queue);
  }

  async fail(id: string, error: string): Promise<void> {
    const now = this.clock();
    const result = markFailed(this.queue, id, error, this.policy, now);
    this.queue = result.queue;
    if (result.deadLettered) {
      this.deadLetters.push({ operation: result.deadLettered, error, at: now });
    }
    await this.storage.save(this.queue);
  }

  peek(): QueuedOperation[] {
    return dueOperations(this.queue, this.clock());
  }

  summary(): QueueSummary {
    return summarise(this.queue, this.clock());
  }
}
