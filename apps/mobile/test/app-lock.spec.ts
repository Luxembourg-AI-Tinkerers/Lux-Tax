import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  availableMethods,
  canEnableLock,
  DEFAULT_LOCK_POLICY,
  lockoutForFailures,
  nextAuthPrompt,
  recordBackgrounded,
  recordFailure,
  recordSuccess,
  shouldLock,
  type LockState,
} from '../src/lib/app-lock';

const T0 = 1_700_000_000_000;

const unlocked: LockState = {
  enabled: true,
  biometricsAvailable: true,
  biometricsEnrolled: true,
  failedAttempts: 0,
  lastUnlockedAt: T0 - 1_000,
  backgroundedAt: null,
  lockedUntil: null,
};

describe('App-lock decisions (MOB-9)', () => {
  test('does nothing when the user never enabled the lock', () => {
    const decision = shouldLock({ ...unlocked, enabled: false }, T0);
    assert.deepStrictEqual(decision, { locked: false, reason: 'DISABLED' });
    assert.deepStrictEqual(nextAuthPrompt({ ...unlocked, enabled: false }, T0), {
      kind: 'NONE',
      reason: 'LOCK_DISABLED',
    });
  });

  test('a fresh session with the lock on is locked', () => {
    const decision = shouldLock({ ...unlocked, lastUnlockedAt: null }, T0);
    assert.strictEqual(decision.locked, true);
    assert.strictEqual(decision.reason, 'FRESH_SESSION');
  });

  test('backgrounding within the grace period does not lock', () => {
    const state = recordBackgrounded(unlocked, T0);
    const decision = shouldLock(state, T0 + 30_000);
    assert.strictEqual(decision.locked, false);
    assert.strictEqual(decision.reason, 'GRACE_PERIOD');
  });

  test('backgrounding beyond the grace period locks', () => {
    const state = recordBackgrounded(unlocked, T0);
    const decision = shouldLock(state, T0 + DEFAULT_LOCK_POLICY.graceMs + 1);
    assert.strictEqual(decision.locked, true);
    assert.strictEqual(decision.reason, 'BACKGROUND_EXPIRED');
  });

  test('the lock-out window wins over everything else', () => {
    const state = { ...unlocked, lockedUntil: T0 + 45_000 };
    const decision = shouldLock(state, T0);
    assert.strictEqual(decision.reason, 'LOCKED_OUT');
    assert.strictEqual(decision.retryAfterSeconds, 45);
  });
});

describe('Lock-out thresholds (MOB-9)', () => {
  test('the first two failures are free', () => {
    assert.strictEqual(lockoutForFailures(1), 0);
    assert.strictEqual(lockoutForFailures(2), 0);
    assert.strictEqual(lockoutForFailures(3), 30_000);
  });

  test('the penalty doubles and is capped', () => {
    assert.strictEqual(lockoutForFailures(3), 30_000);
    assert.strictEqual(lockoutForFailures(4), 60_000);
    assert.strictEqual(lockoutForFailures(5), 120_000);
    assert.strictEqual(lockoutForFailures(9), DEFAULT_LOCK_POLICY.maxLockoutMs);
    assert.strictEqual(lockoutForFailures(50), DEFAULT_LOCK_POLICY.maxLockoutMs);
  });

  test('a failure records the window and the counter', () => {
    let state = unlocked;
    for (let i = 0; i < 2; i += 1) state = recordFailure(state, T0).state;
    assert.strictEqual(state.failedAttempts, 2);
    assert.strictEqual(state.lockedUntil, null, 'free attempts do not lock');

    const third = recordFailure(state, T0 + 1_000);
    assert.strictEqual(third.lockoutMs, 30_000);
    assert.strictEqual(third.state.lockedUntil, T0 + 31_000);
    assert.strictEqual(third.mustSignOut, false);
  });

  test('ten failures force a full sign-in', () => {
    let state = unlocked;
    let outcome = recordFailure(state, T0);
    for (let i = 1; i < DEFAULT_LOCK_POLICY.failuresBeforeSignOut; i += 1) {
      outcome = recordFailure(outcome.state, T0);
    }
    assert.strictEqual(outcome.mustSignOut, true);
    assert.strictEqual(outcome.state.failedAttempts, DEFAULT_LOCK_POLICY.failuresBeforeSignOut);
    assert.deepStrictEqual(nextAuthPrompt(outcome.state, T0), {
      kind: 'SIGN_IN',
      reason: 'TOO_MANY_FAILURES',
    });
  });

  test('a success clears the counter, the window and the background timestamp', () => {
    const dirty: LockState = { ...unlocked, failedAttempts: 4, lockedUntil: T0 + 60_000, backgroundedAt: T0 };
    const clean = recordSuccess(dirty, T0 + 61_000);
    assert.strictEqual(clean.failedAttempts, 0);
    assert.strictEqual(clean.lockedUntil, null);
    assert.strictEqual(clean.backgroundedAt, null);
    assert.strictEqual(clean.lastUnlockedAt, T0 + 61_000);
    assert.strictEqual(shouldLock(clean, T0 + 61_000).locked, false);
  });
});

describe('Fallback when biometrics are unavailable (MOB-9)', () => {
  test('biometrics are offered only when available and enrolled', () => {
    assert.deepStrictEqual(availableMethods(unlocked), ['BIOMETRIC', 'PASSCODE']);
    assert.deepStrictEqual(availableMethods({ ...unlocked, biometricsAvailable: false }), ['PASSCODE']);
    assert.deepStrictEqual(availableMethods({ ...unlocked, biometricsEnrolled: false }), ['PASSCODE']);
  });

  test('no hardware means the passcode prompt, with the reason stated', () => {
    const state = { ...unlocked, biometricsAvailable: false, lastUnlockedAt: null };
    assert.deepStrictEqual(nextAuthPrompt(state, T0), { kind: 'UNLOCK_PASSCODE', reason: 'NO_BIOMETRICS' });
  });

  test('nothing enrolled also falls back', () => {
    const state = { ...unlocked, biometricsEnrolled: false, lastUnlockedAt: null };
    assert.deepStrictEqual(nextAuthPrompt(state, T0), { kind: 'UNLOCK_PASSCODE', reason: 'NOT_ENROLLED' });
  });

  test('a failed biometric attempt offers the passcode instead of retrying silently', () => {
    const state = { ...unlocked, lastUnlockedAt: null };
    assert.deepStrictEqual(nextAuthPrompt(state, T0, DEFAULT_LOCK_POLICY, true), {
      kind: 'UNLOCK_PASSCODE',
      reason: 'BIOMETRIC_FAILED',
    });
  });

  test('during a lock-out the prompt is WAIT with the remaining seconds', () => {
    const state = { ...unlocked, lockedUntil: T0 + 20_000 };
    assert.deepStrictEqual(nextAuthPrompt(state, T0), {
      kind: 'WAIT',
      retryAfterSeconds: 20,
      fallback: 'BIOMETRIC',
    });
  });

  test('an unlocked app needs no prompt', () => {
    assert.deepStrictEqual(nextAuthPrompt(unlocked, T0), { kind: 'NONE', reason: 'ALREADY_UNLOCKED' });
  });

  test('the lock cannot be enabled on a device with no passcode', () => {
    assert.deepStrictEqual(canEnableLock(true), { ok: true });
    const refused = canEnableLock(false);
    assert.strictEqual(refused.ok, false);
    if (!refused.ok) assert.match(refused.reason, /no passcode/i);
  });
});
