import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  buildRegistrationPayload,
  DEFAULT_STALE_AFTER_MS,
  deriveOfflineStatus,
  nextPushAction,
  shouldReplayOnReconnect,
  shouldRetryRegistration,
  type OfflineStatus,
  type PushState,
} from '../src/lib/push-and-status';

const base: PushState = {
  pushEnabled: true,
  permission: 'UNDETERMINED',
  deviceToken: null,
  serverToken: null,
};

describe('Push registration state machine (MOB-7)', () => {
  test('asks for permission first, and only that', () => {
    assert.deepStrictEqual(nextPushAction(base), { action: 'REQUEST_PERMISSION' });
  });

  test('a denied permission shows the settings hint instead of asking again', () => {
    assert.deepStrictEqual(nextPushAction({ ...base, permission: 'DENIED' }), {
      action: 'SHOW_DISABLED_HINT',
    });
  });

  test('once granted it fetches the device token', () => {
    assert.deepStrictEqual(nextPushAction({ ...base, permission: 'GRANTED' }), { action: 'FETCH_TOKEN' });
    assert.deepStrictEqual(nextPushAction({ ...base, permission: 'PROVISIONAL' }), { action: 'FETCH_TOKEN' });
  });

  test('registers only when the token differs from the server copy', () => {
    assert.deepStrictEqual(
      nextPushAction({ ...base, permission: 'GRANTED', deviceToken: 'abc', serverToken: null }),
      { action: 'REGISTER', token: 'abc' },
    );
    assert.deepStrictEqual(
      nextPushAction({ ...base, permission: 'GRANTED', deviceToken: 'abc', serverToken: 'old' }),
      { action: 'REGISTER', token: 'abc' },
    );
    assert.deepStrictEqual(
      nextPushAction({ ...base, permission: 'GRANTED', deviceToken: 'abc', serverToken: 'abc' }),
      { action: 'NONE', reason: 'Token already registered.' },
    );
  });

  test('disabling notifications deregisters the server token', () => {
    assert.deepStrictEqual(
      nextPushAction({ ...base, pushEnabled: false, permission: 'GRANTED', deviceToken: 'abc', serverToken: 'abc' }),
      { action: 'DEREGISTER', token: 'abc' },
    );
    assert.deepStrictEqual(
      nextPushAction({ ...base, pushEnabled: false, permission: 'GRANTED', deviceToken: 'abc', serverToken: null }),
      { action: 'NONE', reason: 'Push disabled by the user.' },
    );
  });

  test('the payload normalises an unknown platform', () => {
    assert.deepStrictEqual(buildRegistrationPayload('tok', 'ios', '1.2.3'), {
      deviceToken: 'tok',
      platform: 'ios',
      appVersion: '1.2.3',
    });
    assert.strictEqual(buildRegistrationPayload('tok', 'web').platform, 'unknown');
    assert.ok(!('appVersion' in buildRegistrationPayload('tok', 'android')));
  });

  test('only transport, 408, 429 and 5xx registration failures are retried', () => {
    assert.strictEqual(shouldRetryRegistration({ ok: false }), true);
    assert.strictEqual(shouldRetryRegistration({ ok: false, status: 408 }), true);
    assert.strictEqual(shouldRetryRegistration({ ok: false, status: 429 }), true);
    assert.strictEqual(shouldRetryRegistration({ ok: false, status: 503 }), true);
    assert.strictEqual(shouldRetryRegistration({ ok: false, status: 400 }), false);
    assert.strictEqual(shouldRetryRegistration({ ok: false, status: 401 }), false);
    assert.strictEqual(shouldRetryRegistration({ ok: true }), false);
  });
});

describe('Offline status banner (MOB-7)', () => {
  const now = 1_700_000_000_000;

  test('offline wins over pending operations', () => {
    const status = deriveOfflineStatus({ isConnected: false, pendingOperations: 3, now });
    assert.strictEqual(status.level, 'OFFLINE');
    assert.strictEqual(status.visible, true);
    assert.match(status.detail, /3 changes will be sent/);
  });

  test('offline with an empty queue mentions the local copy instead', () => {
    const status = deriveOfflineStatus({ isConnected: false, pendingOperations: 0, now });
    assert.match(status.detail, /last data saved on this device/);
  });

  test('singular vs plural is not left to chance', () => {
    assert.match(deriveOfflineStatus({ isConnected: false, pendingOperations: 1, now }).detail, /1 change will/);
    assert.match(deriveOfflineStatus({ isConnected: true, pendingOperations: 1, now }).detail, /1 queued change in progress/);
  });

  test('connected with a non-empty queue shows progress', () => {
    const status = deriveOfflineStatus({ isConnected: true, pendingOperations: 2, now });
    assert.strictEqual(status.level, 'PENDING');
    assert.strictEqual(status.visible, true);
  });

  test('connected, empty queue and fresh data hides the banner', () => {
    const status = deriveOfflineStatus({ isConnected: true, pendingOperations: 0, lastSyncedAt: now - 1_000, now });
    assert.strictEqual(status.level, 'ONLINE');
    assert.strictEqual(status.visible, false);
  });

  test('stale data escalates after the threshold', () => {
    const stale = deriveOfflineStatus({
      isConnected: true,
      pendingOperations: 0,
      lastSyncedAt: now - DEFAULT_STALE_AFTER_MS - 1,
      now,
    });
    assert.strictEqual(stale.level, 'STALE');
    assert.match(stale.detail, /1 day ago/);

    const fresh = deriveOfflineStatus({
      isConnected: true,
      pendingOperations: 0,
      lastSyncedAt: now - 60_000,
      now,
    });
    assert.strictEqual(fresh.level, 'ONLINE');
  });

  test('a never-synced device is not called stale', () => {
    const status = deriveOfflineStatus({ isConnected: true, pendingOperations: 0, lastSyncedAt: null, now });
    assert.strictEqual(status.level, 'ONLINE');
  });

  test('replay happens only on an offline → online transition with queued work', () => {
    const offline: OfflineStatus = deriveOfflineStatus({ isConnected: false, pendingOperations: 2, now });
    const online: OfflineStatus = deriveOfflineStatus({ isConnected: true, pendingOperations: 2, now });

    assert.strictEqual(shouldReplayOnReconnect(offline, online, 2), true);
    // no transition → no replay storm
    assert.strictEqual(shouldReplayOnReconnect(online, online, 2), false);
    // nothing queued → nothing to do
    assert.strictEqual(shouldReplayOnReconnect(offline, online, 0), false);
  });
});
