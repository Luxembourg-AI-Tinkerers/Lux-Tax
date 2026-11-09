import io
p = "apps/mobile/src/lib/queue-runtime.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
old = """let singleton: OfflineQueue | null = null;"""
new = """/**
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

let singleton: OfflineQueue | null = null;"""
assert s.count(old) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(old, new).replace("\n", "\r\n"))
print("ok")
