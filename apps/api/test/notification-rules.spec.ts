import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  NotificationSeverity,
  NotificationType,
} from '@luxtax/contracts';
import {
  defaultNotificationPreference,
  notificationAge,
  shouldDeliverNotification,
} from '../src/modules/notifications/notification-rules';

const HOUSEHOLD = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';

describe('notification delivery rules', () => {
  test('a muted type is not delivered', () => {
    assert.strictEqual(
      shouldDeliverNotification(
        { mutedTypes: [NotificationType.MATERIAL_FIELD_CHANGED] },
        NotificationType.MATERIAL_FIELD_CHANGED,
      ),
      false,
    );
  });

  test('an unmuted type is delivered', () => {
    assert.strictEqual(
      shouldDeliverNotification(
        { mutedTypes: [NotificationType.MATERIAL_FIELD_CHANGED] },
        NotificationType.APPROVAL_REQUESTED,
      ),
      true,
    );
  });

  test('missing preferences deliver everything', () => {
    assert.strictEqual(
      shouldDeliverNotification(null, NotificationType.SECURITY_ALERT),
      true,
    );
    assert.strictEqual(
      shouldDeliverNotification(undefined, NotificationType.DEADLINE_REMINDER),
      true,
    );
    assert.strictEqual(
      shouldDeliverNotification({ mutedTypes: [] }, NotificationType.MISSING_DOCUMENT),
      true,
    );
  });

  test('every notification type is a distinct, non-empty enum string', () => {
    const values = Object.values(NotificationType);
    assert.strictEqual(values.length, 11);
    assert.strictEqual(new Set(values).size, values.length);
    for (const value of values) {
      assert.strictEqual(typeof value, 'string');
      assert.match(value, /^[A-Z][A-Z_]*$/);
    }
  });

  test('every severity is a distinct enum string', () => {
    const values = Object.values(NotificationSeverity);
    assert.deepStrictEqual(values, ['INFO', 'WARNING', 'CRITICAL']);
    assert.strictEqual(new Set(values).size, values.length);
  });

  test('default preference enables both ordinary channels and mutes nothing', () => {
    const pref = defaultNotificationPreference(HOUSEHOLD, USER);
    assert.strictEqual(pref.householdId, HOUSEHOLD);
    assert.strictEqual(pref.userId, USER);
    assert.strictEqual(pref.emailEnabled, true);
    assert.strictEqual(pref.pushEnabled, true);
    assert.deepStrictEqual(pref.mutedTypes, []);
  });
});

describe('notification age buckets', () => {
  const now = new Date('2026-11-08T12:00:00.000Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  test('under a minute is just now', () => {
    assert.strictEqual(notificationAge(ago(30_000), now), 'just now');
    assert.strictEqual(notificationAge(now.toISOString(), now), 'just now');
  });

  test('minutes', () => {
    assert.strictEqual(notificationAge(ago(5 * 60_000), now), '5 min ago');
    assert.strictEqual(notificationAge(ago(59 * 60_000), now), '59 min ago');
  });

  test('hours', () => {
    assert.strictEqual(notificationAge(ago(2 * 3_600_000), now), '2 h ago');
    assert.strictEqual(notificationAge(ago(23 * 3_600_000), now), '23 h ago');
  });

  test('days', () => {
    assert.strictEqual(notificationAge(ago(3 * 86_400_000), now), '3 d ago');
    assert.strictEqual(notificationAge(ago(10 * 86_400_000), now), '10 d ago');
  });

  test('future timestamps clamp and malformed input is unknown', () => {
    assert.strictEqual(
      notificationAge(new Date(now.getTime() + 60_000).toISOString(), now),
      'just now',
    );
    assert.strictEqual(notificationAge('not-a-date', now), 'unknown');
  });
});
