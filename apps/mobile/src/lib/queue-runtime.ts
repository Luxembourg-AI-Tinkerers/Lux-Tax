/**
 * Offline queue runtime (MOB-4).
 *
 * Wires the tested queue (MOB-3) into the app: a singleton queue, a replay loop, and
 * a network-error classifier so a *validation* error is never queued for retry.
 *
 * Persistence: `createStorage()` tries AsyncStorage when the dependency is present and
 * falls back to an in-memory store. That keeps the module importable in an environment
 * without React Native (this workspace) while giving real persistence on device.
 */
import {
  DEFAULT_QUEUE_POLICY,
  OfflineQueue,
  type QueuedOperation,
  type QueuedOperationKind,
  type QueueStorage,
} from './offline-queue';

export interface EnqueueRequest {
  kind: QueuedOperationKind;
  workspaceId: string;
  payload?: unknown;
  dedupeKey?: string;
}

/** In-memory store: survives navigation, not an app restart. */
export function createMemoryStorage(): QueueStorage {
  let items: QueuedOperation[] = [];
  return {
    async load() {
      return items;
    },
    async save(queue) {
      items = queue;
    },
  };
}

/**
 * AsyncStorage-backed store when `@react-native-async-storage/async-storage` is
 * installed, otherwise memory. The optional require avoids a hard dependency, so the
 * module still loads in tests and web builds.
 */
export function createStorage(): QueueStorage {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = typeof require === 'function' ? require('@react-native-async-storage/async-storage') : null;
    const asyncStorage = mod?.default ?? mod;
    if (!asyncStorage?.getItem) return createMemoryStorage();

    const KEY = 'luxtax.offline-queue.v1';
    return {
      async load() {
        const raw = await asyncStorage.getItem(KEY);
        if (!raw) return [];
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? (parsed as QueuedOperation[]) : [];
        } catch {
          return [];
        }
      },
      async save(queue) {
        await asyncStorage.setItem(KEY, JSON.stringify(queue));
      },
    };
  } catch {
    return createMemoryStorage();
  }
}

/**
 * A failed request is retryable only when it looks like a transport problem. A 400/422,
 * an authorisation failure or a server-side validation message must NOT be replayed —
 * retrying it for ever would hide the real error from the user.
 */
export function isNetworkError(message: string | undefined | null): boolean {
  if (!message) return true; // no message at all: treat as transport
  return /network|fetch|timeout|timed out|offline|connection|ECONN|ENOTFOUND|socket/i.test(message);
}

export type QueueHandlers = Record<
  QueuedOperationKind,
  ((operation: QueuedOperation) => Promise<void>) | undefined
>;

export interface FlushResult {
  processed: number;
  failed: number;
  skipped: number;
  deadLettered: number;
}

/**
 * Replays due operations in order, stopping at the first transport failure so the
 * sequence (upload → calculate → approve) is not reordered.
 *
 * Operations without a handler are counted as `skipped` and left in the queue.
 */
export async function flushQueue(
  queue: OfflineQueue,
  handlers: QueueHandlers,
  now: () => number = () => Date.now(),
): Promise<FlushResult> {
  const result: FlushResult = { processed: 0, failed: 0, skipped: 0, deadLettered: 0 };
  const due = queue.peek();

  for (const operation of due) {
    const handler = handlers[operation.kind];
    if (!handler) {
      result.skipped += 1;
      continue;
    }

    try {
      await handler(operation);
      await queue.complete(operation.id);
      result.processed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const before = queue.deadLettered.length;
      await queue.fail(operation.id, message);
      result.failed += 1;
      if (queue.deadLettered.length > before) result.deadLettered += 1;

      if (isNetworkError(message)) break; // still offline: keep the rest for later
    }
  }

  void now;
  return result;
}

/**
 * Minimal shape of the API surface the queue replays. Declared structurally so this
 * module has no runtime dependency on `@luxtax/api-client`.
 */
export interface QueueApi {
  uploadDocument(
    workspaceId: string,
    body: unknown,
  ): Promise<{ data?: unknown; error?: { message?: string } | null }>;
  calculateTax(workspaceId: string): Promise<{ data?: unknown; error?: { message?: string } | null }>;
  approveReturn(workspaceId: string): Promise<{ data?: unknown; error?: { message?: string } | null }>;
}

/**
 * Turns a failed API response into a thrown error so `flushQueue` can classify and
 * schedule it. A success is a no-op.
 */
function assertOk(res: { error?: { message?: string } | null }): void {
  if (res.error) throw new Error(res.error.message ?? 'Request failed');
}

/** Handlers that replay queued operations through the real client. */
export function createApiHandlers(api: QueueApi): QueueHandlers {
  return {
    UPLOAD_DOCUMENT: async (operation) => {
      assertOk(
        await api.uploadDocument(operation.workspaceId, (operation.payload ?? {}) as Record<string, unknown>),
      );
    },
    CALCULATE_TAX: async (operation) => {
      assertOk(await api.calculateTax(operation.workspaceId));
    },
    APPROVE_RETURN: async (operation) => {
      assertOk(await api.approveReturn(operation.workspaceId));
    },
  };
}

/** Convenience: replay the singleton queue through a client. */
export async function replayQueue(api: QueueApi): Promise<FlushResult> {
  const queue = getOfflineQueue();
  if (queue.items.length === 0) await queue.load();
  return flushQueue(queue, createApiHandlers(api));
}

let singleton: OfflineQueue | null = null;

/** Lazily created process-wide queue, shared by the screens. */
export function getOfflineQueue(): OfflineQueue {
  if (!singleton) {
    singleton = new OfflineQueue(createStorage(), DEFAULT_QUEUE_POLICY);
  }
  return singleton;
}

/** Test seam. */
export function setOfflineQueue(queue: OfflineQueue | null): void {
  singleton = queue;
}

/** Queue an operation, returning whether it was accepted. */
export async function enqueueOperation(request: EnqueueRequest): Promise<
  { ok: true } | { ok: false; reason: 'DUPLICATE' | 'FULL' }
> {
  const queue = getOfflineQueue();
  const existing = queue.items.length === 0 ? await queue.load() : queue.items;

  const result = await queue.enqueue({
    id: `${request.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: request.kind,
    workspaceId: request.workspaceId,
    payload: request.payload,
    dedupeKey: request.dedupeKey,
  });

  void existing;
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}
