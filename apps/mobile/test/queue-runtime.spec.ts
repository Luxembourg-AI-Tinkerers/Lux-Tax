import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  DEFAULT_QUEUE_POLICY,
  OfflineQueue,
  type QueuedOperation,
  type QueueStorage,
} from '../src/lib/offline-queue';
import {
  createMemoryStorage,
  flushQueue,
  isNetworkError,
  setOfflineQueue,
  getOfflineQueue,
} from '../src/lib/queue-runtime';

const T0 = 1_700_000_000_000;

function memory(): QueueStorage & { items: QueuedOperation[] } {
  const state = createMemoryStorage();
  const wrapper = {
    items: [] as QueuedOperation[],
    async load() {
      return state.load();
    },
    async save(queue: QueuedOperation[]) {
      wrapper.items = queue;
      await state.save(queue);
    },
  };
  return wrapper;
}

async function queueWith(
  entries: Array<{ id: string; kind: 'UPLOAD_DOCUMENT' | 'CALCULATE_TAX' | 'APPROVE_RETURN' }>,
): Promise<OfflineQueue> {
  const queue = new OfflineQueue(memory(), DEFAULT_QUEUE_POLICY, () => T0);
  await queue.load();
  for (const entry of entries) {
    await queue.enqueue({ id: entry.id, kind: entry.kind, workspaceId: 'w1' });
  }
  return queue;
}

describe('Offline queue runtime (MOB-4)', () => {
  test('only transport failures are treated as retryable', () => {
    assert.strictEqual(isNetworkError('Network request failed'), true);
    assert.strictEqual(isNetworkError('fetch failed'), true);
    assert.strictEqual(isNetworkError('timeout'), true);
    assert.strictEqual(isNetworkError('ECONNREFUSED'), true);
    assert.strictEqual(isNetworkError(undefined), true);

    assert.strictEqual(isNetworkError('Validation failed: amount is required'), false);
    assert.strictEqual(isNetworkError('401 Unauthorized'), false);
    assert.strictEqual(isNetworkError('Workspace not found'), false);
  });

  test('replays due operations in order and clears them', async () => {
    const queue = await queueWith([
      { id: 'u1', kind: 'UPLOAD_DOCUMENT' },
      { id: 'c1', kind: 'CALCULATE_TAX' },
      { id: 'a1', kind: 'APPROVE_RETURN' },
    ]);

    const order: string[] = [];
    const result = await flushQueue(queue, {
      UPLOAD_DOCUMENT: async (op) => void order.push(op.id),
      CALCULATE_TAX: async (op) => void order.push(op.id),
      APPROVE_RETURN: async (op) => void order.push(op.id),
    });

    assert.deepStrictEqual(order, ['u1', 'c1', 'a1']);
    assert.deepStrictEqual(result, { processed: 3, failed: 0, skipped: 0, deadLettered: 0 });
    assert.strictEqual(queue.items.length, 0);
  });

  test('stops at the first transport failure and keeps the rest queued', async () => {
    const queue = await queueWith([
      { id: 'u1', kind: 'UPLOAD_DOCUMENT' },
      { id: 'c1', kind: 'CALCULATE_TAX' },
    ]);

    const attempted: string[] = [];
    const result = await flushQueue(queue, {
      UPLOAD_DOCUMENT: async () => {
        attempted.push('u1');
        throw new Error('Network request failed');
      },
      CALCULATE_TAX: async () => void attempted.push('c1'),
      APPROVE_RETURN: undefined,
    });

    assert.deepStrictEqual(attempted, ['u1'], 'must not continue while offline');
    assert.strictEqual(result.failed, 1);
    assert.strictEqual(queue.items.length, 2, 'both operations stay queued');
  });

  test('a non-transport failure does not stop the line', async () => {
    const queue = await queueWith([
      { id: 'u1', kind: 'UPLOAD_DOCUMENT' },
      { id: 'c1', kind: 'CALCULATE_TAX' },
    ]);

    const done: string[] = [];
    const result = await flushQueue(queue, {
      UPLOAD_DOCUMENT: async () => {
        throw new Error('Validation failed');
      },
      CALCULATE_TAX: async (op) => void done.push(op.id),
      APPROVE_RETURN: undefined,
    });

    assert.deepStrictEqual(done, ['c1']);
    assert.strictEqual(result.processed, 1);
    assert.strictEqual(result.failed, 1);
  });

  test('operations without a handler are skipped, not dropped', async () => {
    const queue = await queueWith([{ id: 'a1', kind: 'APPROVE_RETURN' }]);
    const result = await flushQueue(queue, {
      UPLOAD_DOCUMENT: undefined,
      CALCULATE_TAX: undefined,
      APPROVE_RETURN: undefined,
    });
    assert.strictEqual(result.skipped, 1);
    assert.strictEqual(queue.items.length, 1);
  });

  test('dead letters are counted when the retry budget is exhausted', async () => {
    const storage = memory();
    const queue = new OfflineQueue(storage, { ...DEFAULT_QUEUE_POLICY, maxAttempts: 1 }, () => T0);
    await queue.load();
    await queue.enqueue({ id: 'x', kind: 'CALCULATE_TAX', workspaceId: 'w1' });

    const result = await flushQueue(queue, {
      UPLOAD_DOCUMENT: undefined,
      CALCULATE_TAX: async () => {
        throw new Error('Validation failed');
      },
      APPROVE_RETURN: undefined,
    });

    assert.strictEqual(result.deadLettered, 1);
    assert.strictEqual(queue.items.length, 0);
  });

  test('the singleton is replaceable for tests', () => {
    const before = getOfflineQueue();
    assert.ok(before);
    setOfflineQueue(null);
    const after = getOfflineQueue();
    assert.notStrictEqual(before, after);
    setOfflineQueue(null);
  });
});
