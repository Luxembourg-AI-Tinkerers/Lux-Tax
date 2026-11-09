import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  backoffDelay,
  DEFAULT_QUEUE_POLICY,
  dueOperations,
  enqueue,
  markFailed,
  markSucceeded,
  OfflineQueue,
  summarise,
  type QueuedOperation,
  type QueueStorage,
} from '../src/lib/offline-queue';

const T0 = 1_700_000_000_000;

function seed(): QueuedOperation[] {
  const first = enqueue(
    [],
    { id: 'a', kind: 'UPLOAD_DOCUMENT', workspaceId: 'w1', dedupeKey: 'file:1' },
    DEFAULT_QUEUE_POLICY,
    T0,
  );
  assert.ok(first.ok);
  const second = enqueue(
    first.queue,
    { id: 'b', kind: 'CALCULATE_TAX', workspaceId: 'w1' },
    DEFAULT_QUEUE_POLICY,
    T0 + 10,
  );
  assert.ok(second.ok);
  return second.queue;
}

describe('Offline queue (MOB-3)', () => {
  test('enqueues in order and exposes what is due', () => {
    const queue = seed();
    assert.deepStrictEqual(queue.map((q) => q.id), ['a', 'b']);
    assert.deepStrictEqual(dueOperations(queue, T0 + 10).map((q) => q.id), ['a', 'b']);
    assert.deepStrictEqual(dueOperations(queue, T0 - 1).map((q) => q.id), []);
  });

  test('dedupe key prevents the same intent twice, and says so', () => {
    const queue = seed();
    const duplicate = enqueue(
      queue,
      { id: 'c', kind: 'UPLOAD_DOCUMENT', workspaceId: 'w1', dedupeKey: 'file:1' },
      DEFAULT_QUEUE_POLICY,
      T0 + 20,
    );
    assert.strictEqual(duplicate.ok, false);
    if (!duplicate.ok) assert.strictEqual(duplicate.reason, 'DUPLICATE');
    assert.strictEqual(duplicate.queue.length, 2);
  });

  test('a full queue is reported, not silently truncated', () => {
    const policy = { ...DEFAULT_QUEUE_POLICY, maxItems: 1 };
    const one = enqueue([], { id: 'a', kind: 'CALCULATE_TAX', workspaceId: 'w' }, policy, T0);
    assert.ok(one.ok);
    const overflow = enqueue(
      one.queue,
      { id: 'b', kind: 'CALCULATE_TAX', workspaceId: 'w' },
      policy,
      T0,
    );
    assert.strictEqual(overflow.ok, false);
    if (!overflow.ok) assert.strictEqual(overflow.reason, 'FULL');
  });

  test('success removes exactly one operation', () => {
    const queue = seed();
    const after = markSucceeded(queue, 'a');
    assert.deepStrictEqual(after.map((q) => q.id), ['b']);
    assert.deepStrictEqual(markSucceeded(after, 'missing').map((q) => q.id), ['b']);
  });

  test('failure schedules an exponential backoff that is honoured', () => {
    const queue = seed();
    const first = markFailed(queue, 'a', 'network', DEFAULT_QUEUE_POLICY, T0);
    assert.strictEqual(first.queue.length, 2);

    const item = first.queue.find((q) => q.id === 'a')!;
    assert.strictEqual(item.attempts, 1);
    assert.strictEqual(item.lastError, 'network');
    assert.strictEqual(item.nextAttemptAt, T0 + 5_000);

    // not due before the delay
    assert.deepStrictEqual(dueOperations(first.queue, T0 + 4_999).map((q) => q.id), ['b']);
    assert.deepStrictEqual(dueOperations(first.queue, T0 + 5_000).map((q) => q.id), ['a', 'b']);

    // second failure doubles the delay
    const second = markFailed(first.queue, 'a', 'network', DEFAULT_QUEUE_POLICY, T0 + 5_000);
    const again = second.queue.find((q) => q.id === 'a')!;
    assert.strictEqual(again.attempts, 2);
    assert.strictEqual(again.nextAttemptAt, T0 + 5_000 + 10_000);
  });

  test('backoff is capped by maxDelayMs', () => {
    assert.strictEqual(backoffDelay(1), 5_000);
    assert.strictEqual(backoffDelay(2), 10_000);
    assert.strictEqual(backoffDelay(3), 20_000);
    assert.strictEqual(backoffDelay(20), DEFAULT_QUEUE_POLICY.maxDelayMs);
  });

  test('an operation is dead-lettered after maxAttempts instead of retrying for ever', () => {
    const policy = { ...DEFAULT_QUEUE_POLICY, maxAttempts: 3 };
    let queue = seed();
    let now = T0;
    let dead: QueuedOperation | undefined;

    for (let i = 0; i < 3; i += 1) {
      const result = markFailed(queue, 'a', 'boom', policy, now);
      queue = result.queue;
      dead = result.deadLettered ?? dead;
      now += 60_000;
    }

    assert.ok(dead, 'operation should be dead-lettered');
    assert.strictEqual(dead!.attempts, 3);
    assert.ok(!queue.some((q) => q.id === 'a'), 'dead operation leaves the active queue');
    assert.deepStrictEqual(queue.map((q) => q.id), ['b']);
  });

  test('summary counts by kind, due items and oldest age', () => {
    const queue = seed();
    const summary = summarise(queue, T0 + 1_000);
    assert.strictEqual(summary.total, 2);
    assert.strictEqual(summary.due, 2);
    assert.strictEqual(summary.byKind.UPLOAD_DOCUMENT, 1);
    assert.strictEqual(summary.byKind.CALCULATE_TAX, 1);
    assert.strictEqual(summary.byKind.APPROVE_RETURN, 0);
    assert.strictEqual(summary.oldestAgeMs, 1_000);
    assert.strictEqual(summary.retrying, 0);

    const empty = summarise([], T0);
    assert.strictEqual(empty.total, 0);
    assert.strictEqual(empty.oldestAgeMs, 0);
  });

  test('an operation carries the workspace id, never a household id', () => {
    const queue = seed();
    for (const item of queue) assert.strictEqual(item.workspaceId, 'w1');
  });

  test('the stateful queue persists after every mutation', async () => {
    const saved: QueuedOperation[][] = [];
    let stored: QueuedOperation[] = [];
    const storage: QueueStorage = {
      async load() {
        return stored;
      },
      async save(queue) {
        stored = queue;
        saved.push(queue);
      },
    };

    const queue = new OfflineQueue(storage, DEFAULT_QUEUE_POLICY, () => T0);
    await queue.load();
    assert.strictEqual(queue.items.length, 0);

    await queue.enqueue({ id: 'a', kind: 'UPLOAD_DOCUMENT', workspaceId: 'w1', dedupeKey: 'f' });
    assert.strictEqual(saved.length, 1);
    assert.strictEqual(stored.length, 1);

    await queue.fail('a', 'offline');
    assert.strictEqual(saved.length, 2);
    assert.strictEqual(stored[0].attempts, 1);

    await queue.complete('a');
    assert.strictEqual(saved.length, 3);
    assert.strictEqual(stored.length, 0);
  });

  test('the stateful queue records dead letters for the UI', async () => {
    let stored: QueuedOperation[] = [];
    const storage: QueueStorage = {
      async load() {
        return stored;
      },
      async save(queue) {
        stored = queue;
      },
    };
    const policy = { ...DEFAULT_QUEUE_POLICY, maxAttempts: 1 };
    const queue = new OfflineQueue(storage, policy, () => T0);

    await queue.load();
    await queue.enqueue({ id: 'x', kind: 'APPROVE_RETURN', workspaceId: 'w1' });
    await queue.fail('x', 'server error');

    assert.strictEqual(queue.items.length, 0);
    assert.strictEqual(queue.deadLettered.length, 1);
    assert.strictEqual(queue.deadLettered[0].error, 'server error');
  });
});
