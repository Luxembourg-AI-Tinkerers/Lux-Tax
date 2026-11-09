import { test, describe } from 'node:test';
import assert from 'node:assert';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
  MAX_DELIVERY_ATTEMPTS,
  backoffDelayMs,
  channelsForNotification,
  isDue,
  isRetryable,
  isWithinReminderWindow,
  nextAttemptAt,
} from '../src/modules/notifications/notification-delivery';
import { EmailAdapter, LocalSinkEmailTransport } from '../src/modules/notifications/adapters/email.adapter';
import { PushAdapter, LocalSinkPushTransport } from '../src/modules/notifications/adapters/push.adapter';

const payload = {
  notificationId: '11111111-1111-1111-1111-111111111111',
  userId: '22222222-2222-2222-2222-222222222222',
  email: 'resident@example.lu',
  type: 'APPROVAL_REQUESTED',
  severity: 'INFO',
  title: 'Approval requested',
  body: 'A household member is waiting for your approval.',
};

describe('Outbox retry policy', () => {
  test('backoff grows 1 min, 5 min, 25 min and caps at one hour', () => {
    assert.strictEqual(backoffDelayMs(0), BASE_BACKOFF_MS);
    assert.strictEqual(backoffDelayMs(1), 5 * 60_000);
    assert.strictEqual(backoffDelayMs(2), 25 * 60_000);
    assert.strictEqual(backoffDelayMs(3), MAX_BACKOFF_MS);
    assert.strictEqual(backoffDelayMs(10), MAX_BACKOFF_MS);
  });

  test('an invalid attempt count falls back to the first delay instead of NaN', () => {
    assert.strictEqual(backoffDelayMs(Number.NaN), BASE_BACKOFF_MS);
    assert.strictEqual(backoffDelayMs(-3), BASE_BACKOFF_MS);
  });

  test('nextAttemptAt is now + delay', () => {
    const now = new Date('2026-11-09T10:00:00.000Z');
    assert.strictEqual(
      nextAttemptAt(1, now).toISOString(),
      '2026-11-09T10:05:00.000Z',
    );
  });

  test('the fifth failure is the last one', () => {
    assert.strictEqual(MAX_DELIVERY_ATTEMPTS, 5);
    assert.strictEqual(isRetryable(1), true);
    assert.strictEqual(isRetryable(4), true);
    assert.strictEqual(isRetryable(5), false);
    assert.strictEqual(isRetryable(0), false);
  });

  test('due means PENDING and the scheduled time has passed', () => {
    const now = new Date('2026-11-09T10:00:00.000Z');
    assert.strictEqual(isDue('PENDING', new Date('2026-11-09T09:59:00.000Z'), now), true);
    assert.strictEqual(isDue('PENDING', new Date('2026-11-09T10:01:00.000Z'), now), false);
    assert.strictEqual(isDue('SENDING', new Date('2026-11-09T09:00:00.000Z'), now), false);
    assert.strictEqual(isDue('SENT', new Date('2026-11-09T09:00:00.000Z'), now), false);
  });
});

describe('Deadline reminder window', () => {
  const now = new Date('2026-11-09T10:00:00.000Z');

  test('a deadline inside the next 30 days is reminded', () => {
    assert.strictEqual(isWithinReminderWindow(new Date('2026-11-20T00:00:00.000Z'), now), true);
    assert.strictEqual(isWithinReminderWindow(new Date('2026-12-09T10:00:00.000Z'), now), true);
  });

  test('a past or far-future deadline is not', () => {
    assert.strictEqual(isWithinReminderWindow(new Date('2026-11-08T10:00:00.000Z'), now), false);
    assert.strictEqual(isWithinReminderWindow(new Date('2027-01-15T00:00:00.000Z'), now), false);
  });
});

describe('Channel selection', () => {
  test('no preference row means both channels, like the defaults', () => {
    assert.deepStrictEqual(channelsForNotification(null, 'MATERIAL_FIELD_CHANGED'), [
      'EMAIL',
      'PUSH',
    ]);
  });

  test('each toggle is respected', () => {
    assert.deepStrictEqual(
      channelsForNotification({ emailEnabled: true, pushEnabled: false }, 'MATERIAL_FIELD_CHANGED'),
      ['EMAIL'],
    );
    assert.deepStrictEqual(
      channelsForNotification({ emailEnabled: false, pushEnabled: true }, 'MATERIAL_FIELD_CHANGED'),
      ['PUSH'],
    );
    assert.deepStrictEqual(
      channelsForNotification({ emailEnabled: false, pushEnabled: false }, 'MATERIAL_FIELD_CHANGED'),
      [],
    );
  });

  test('a security alert ignores preferences', () => {
    assert.deepStrictEqual(
      channelsForNotification({ emailEnabled: false, pushEnabled: false }, 'SECURITY_ALERT'),
      ['EMAIL', 'PUSH'],
    );
  });
});

describe('Channel adapters', () => {
  test('the e-mail adapter serialises the message and returns a receipt', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'luxtax-mail-'));
    const sink = join(dir, 'email.jsonl');
    try {
      const adapter = new EmailAdapter().useTransport(new LocalSinkEmailTransport(sink));
      assert.strictEqual(adapter.isConfigured(), true);
      const receipt = await adapter.send(payload);
      assert.match(receipt, /^local:/);

      const lines = (await readFile(sink, 'utf8')).trim().split('\n');
      assert.strictEqual(lines.length, 1);
      const message = JSON.parse(lines[0]);
      assert.strictEqual(message.channel, 'EMAIL');
      assert.strictEqual(message.to, 'resident@example.lu');
      assert.strictEqual(message.subject, 'Approval requested');
      assert.ok(!('amount' in message), 'no amount may leave the app');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('an account without an address fails instead of sending nowhere', async () => {
    const adapter = new EmailAdapter();
    await assert.rejects(() => adapter.send({ ...payload, email: null }), /no e-mail/i);
  });

  test('push is not configured by default and says so', async () => {
    const previous = process.env.NOTIFICATION_PUSH_ENABLED;
    delete process.env.NOTIFICATION_PUSH_ENABLED;
    try {
      const adapter = new PushAdapter();
      assert.strictEqual(adapter.isConfigured(), false);
      await assert.rejects(() => adapter.send(payload), /No push transport/);
    } finally {
      if (previous === undefined) delete process.env.NOTIFICATION_PUSH_ENABLED;
      else process.env.NOTIFICATION_PUSH_ENABLED = previous;
    }
  });

  test('a wired push transport works', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'luxtax-push-'));
    const sink = join(dir, 'push.jsonl');
    try {
      const adapter = new PushAdapter().useTransport(new LocalSinkPushTransport(sink));
      assert.strictEqual(adapter.isConfigured(), true);
      await adapter.send(payload);
      const message = JSON.parse((await readFile(sink, 'utf8')).trim());
      assert.strictEqual(message.channel, 'PUSH');
      assert.strictEqual(message.userId, payload.userId);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
