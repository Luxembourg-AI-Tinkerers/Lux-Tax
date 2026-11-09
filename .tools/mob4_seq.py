import io
p = "apps/mobile/src/lib/offline-queue.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:80])
    s = s.replace(old, new)

rep("""  readonly enqueuedAt: number;""",
"""  readonly enqueuedAt: number;
  /** Monotonic insertion counter: the tie-breaker when two items share a timestamp. */
  readonly seq: number;""")

rep("""  const operation: QueuedOperation = {
    id: input.id,
    kind: input.kind,
    workspaceId: input.workspaceId,
    payload: input.payload,
    dedupeKey: input.dedupeKey,
    enqueuedAt: now,
    attempts: 0,
    nextAttemptAt: now,
  };""",
"""  const nextSeq = queue.reduce((max, item) => Math.max(max, item.seq ?? 0), 0) + 1;

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
  };""")

rep("""    .sort((a, b) => a.enqueuedAt - b.enqueuedAt || a.id.localeCompare(b.id));""",
"""    .sort(
      (a, b) =>
        a.enqueuedAt - b.enqueuedAt ||
        (a.seq ?? 0) - (b.seq ?? 0) ||
        a.id.localeCompare(b.id),
    );""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
