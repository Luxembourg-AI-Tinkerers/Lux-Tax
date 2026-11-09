import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  runOutboxPass,
  type OutboxDeliveryRow,
  type OutboxStore,
} from '../src/modules/notifications/notification-outbox';
import { EmailAdapter, type EmailTransport } from '../src/modules/notifications/adapters/email.adapter';
import { PushAdapter } from '../src/modules/notifications/adapters/push.adapter';

interface Row extends OutboxDeliveryRow {
  status: string;
  nextAttemptAt: Date;
  lastError: string | null;
  sentAt: Date | null;
}

function fakeStore(rows: Row[]): OutboxStore {
  return {
    async findDue(limit, now) {
      return rows
        .filter((row) => row.status === 'PENDING' && row.nextAttemptAt.getTime() <= now.getTime())
        .slice(0, limit);
    },
    async claim(id) {
      const row = rows.find((candidate) => candidate.id === id);
      if (!row || row.status !== 'PENDING') return false;
      row.status = 'SENDING';
      return true;
    },
    async markSent(id, sentAt) {
      Object.assign(rows.find((row) => row.id === id)!, { status: 'SENT', sentAt });
    },
    async markSkipped(id, reason) {
      Object.assign(rows.find((row) => row.id === id)!, { status: 'SKIPPED', lastError: reason });
    },
    async markRetry(id, attempts, error, next) {
      Object.assign(rows.find((row) => row.id === id)!, {
        status: 'PENDING',
        attempts,
        lastError: error,
        nextAttemptAt: next,
      });
    },
    async markFailed(id, attempts, error) {
      Object.assign(rows.find((row) => row.id === id)!, {
        status: 'FAILED',
        attempts,
        lastError: error,
      });
    },
  };
}

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 'd1',
    notificationId: 'n1',
    channel: 'EMAIL',
    attempts: 0,
    status: 'PENDING',
    nextAttemptAt: new Date(Date.now() - 1_000),
    lastError: null,
    sentAt: null,
    notification: {
      userId: 'u1',
      type: 'APPROVAL_REQUESTED',
      severity: 'INFO',
      title: 'Approval requested',
      body: 'Waiting for you.',
      user: { email: 'resident@example.lu' },
    },
    ...overrides,
  };
}

const okTransport: EmailTransport = {
  name: 'test',
  async send() {
    return 'receipt-1';
  },
};

const failingTransport: EmailTransport = {
  name: 'test',
  async send() {
    throw new Error('smtp 451');
  },
};

const email = (transport: EmailTransport) => new EmailAdapter().useTransport(transport);

describe('Notification outbox pass', () => {
  test('a due row is sent and marked SENT', async () => {
    const rows = [row()];
    const result = await runOutboxPass(fakeStore(rows), [email(okTransport), new PushAdapter()]);

    assert.deepStrictEqual(result, { scanned: 1, sent: 1, retried: 0, failed: 0, skipped: 0 });
    assert.strictEqual(rows[0].status, 'SENT');
    assert.ok(rows[0].sentAt instanceof Date);
  });

  test('a failure is rescheduled with the first backoff', async () => {
    const rows = [row()];
    const now = new Date();
    const result = await runOutboxPass(
      fakeStore(rows),
      [email(failingTransport), new PushAdapter()],
      25,
      now,
    );

    assert.strictEqual(result.retried, 1);
    assert.strictEqual(rows[0].status, 'PENDING');
    assert.strictEqual(rows[0].attempts, 1);
    assert.match(rows[0].lastError ?? '', /smtp 451/);
    assert.strictEqual(rows[0].nextAttemptAt.getTime(), now.getTime() + 60_000);
  });

  test('the fifth failure is a dead letter', async () => {
    const rows = [row({ attempts: 4 })];
    const result = await runOutboxPass(fakeStore(rows), [
      email(failingTransport),
      new PushAdapter(),
    ]);

    assert.strictEqual(result.failed, 1);
    assert.strictEqual(rows[0].status, 'FAILED');
    assert.strictEqual(rows[0].attempts, 5);
  });

  test('an unconfigured push channel is skipped, not retried', async () => {
    const previous = process.env.NOTIFICATION_PUSH_ENABLED;
    delete process.env.NOTIFICATION_PUSH_ENABLED;
    try {
      const rows = [row({ channel: 'PUSH' })];
      const result = await runOutboxPass(fakeStore(rows), [
        email(okTransport),
        new PushAdapter(),
      ]);

      assert.strictEqual(result.skipped, 1);
      assert.strictEqual(rows[0].status, 'SKIPPED');
      assert.match(rows[0].lastError ?? '', /no transport configured/i);
    } finally {
      if (previous === undefined) delete process.env.NOTIFICATION_PUSH_ENABLED;
      else process.env.NOTIFICATION_PUSH_ENABLED = previous;
    }
  });

  test('a row already claimed by another worker is not sent twice', async () => {
    const rows = [row({ status: 'SENDING' })];
    const result = await runOutboxPass(fakeStore(rows), [email(okTransport), new PushAdapter()]);

    assert.strictEqual(result.scanned, 0);
    assert.strictEqual(result.sent, 0);
  });

  test('a missing adapter skips the row instead of throwing', async () => {
    const rows = [row({ channel: 'PUSH' })];
    const result = await runOutboxPass(fakeStore(rows), [email(okTransport)]);

    assert.strictEqual(result.skipped, 1);
    assert.match(rows[0].lastError ?? '', /no adapter registered/i);
  });

  test('one bad row does not stop the next one', async () => {
    const rows = [row({ id: 'bad' }), row({ id: 'good', notificationId: 'n2' })];
    const flaky: EmailTransport = {
      name: 'flaky',
      async send(message) {
        if (message.notificationId === 'n1') throw new Error('smtp 451');
        return 'receipt-2';
      },
    };

    const result = await runOutboxPass(fakeStore(rows), [email(flaky), new PushAdapter()]);
    assert.strictEqual(result.retried, 1);
    assert.strictEqual(result.sent, 1);
  });
});
