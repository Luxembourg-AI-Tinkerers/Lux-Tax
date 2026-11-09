/**
 * App-lock policy (MOB-9).
 *
 * The screen that asks for a fingerprint is trivial; the rules around it are not: when the
 * app relocks after backgrounding, how long a wrong attempt costs, when biometrics must fall
 * back to the device passcode, and when repeated failures should force a full sign-in.
 *
 * All of it is pure so it can be proven here, with no biometric hardware.
 */

export interface LockPolicy {
  /** Relock only after the app has been in the background this long. */
  readonly graceMs: number;
  /** Failures that are free (typos happen). */
  readonly freeAttempts: number;
  /** Lockout after the first penalised failure, ms. */
  readonly baseLockoutMs: number;
  readonly maxLockoutMs: number;
  /** Total failures before the session is discarded. */
  readonly failuresBeforeSignOut: number;
}

export const DEFAULT_LOCK_POLICY: LockPolicy = {
  graceMs: 60_000,
  freeAttempts: 2,
  baseLockoutMs: 30_000,
  maxLockoutMs: 15 * 60_000,
  failuresBeforeSignOut: 10,
};

export interface LockState {
  /** The user enabled the app lock (opt-in; default off). */
  readonly enabled: boolean;
  readonly biometricsAvailable: boolean;
  readonly biometricsEnrolled: boolean;
  readonly failedAttempts: number;
  readonly lockedUntil?: number | null;
  readonly lastUnlockedAt?: number | null;
  readonly backgroundedAt?: number | null;
}

export type LockReason = 'DISABLED' | 'FRESH_SESSION' | 'GRACE_PERIOD' | 'BACKGROUND_EXPIRED' | 'LOCKED_OUT';

export interface LockDecision {
  readonly locked: boolean;
  readonly reason: LockReason;
  /** Seconds until another attempt is allowed, when locked out. */
  readonly retryAfterSeconds?: number;
}

/**
 * Should the lock screen be shown?
 *
 * A locked-out attempt window takes precedence: showing biometrics while the user is in
 * penalty only wastes a sensor call and increments the counter again.
 */
export function shouldLock(
  state: LockState,
  now: number,
  policy: LockPolicy = DEFAULT_LOCK_POLICY,
): LockDecision {
  if (!state.enabled) return { locked: false, reason: 'DISABLED' };

  if (state.lockedUntil && state.lockedUntil > now) {
    return {
      locked: true,
      reason: 'LOCKED_OUT',
      retryAfterSeconds: Math.ceil((state.lockedUntil - now) / 1000),
    };
  }

  if (!state.lastUnlockedAt) {
    return { locked: true, reason: 'FRESH_SESSION' };
  }

  if (state.backgroundedAt && now - state.backgroundedAt > policy.graceMs) {
    return { locked: true, reason: 'BACKGROUND_EXPIRED' };
  }

  if (state.backgroundedAt) {
    return { locked: false, reason: 'GRACE_PERIOD' };
  }

  return { locked: false, reason: 'GRACE_PERIOD' };
}

/**
 * Penalty for the next failure: free attempts cost nothing, then 30 s, 60 s, 2 min … capped.
 */
export function lockoutForFailures(
  failedAttempts: number,
  policy: LockPolicy = DEFAULT_LOCK_POLICY,
): number {
  const penalised = failedAttempts - policy.freeAttempts;
  if (penalised <= 0) return 0;
  const exponent = Math.min(penalised - 1, 10);
  return Math.min(policy.maxLockoutMs, policy.baseLockoutMs * 2 ** exponent);
}

export interface FailureOutcome {
  readonly state: LockState;
  readonly lockoutMs: number;
  /** True when the app must discard the session and ask for a full sign-in. */
  readonly mustSignOut: boolean;
}

export function recordFailure(
  state: LockState,
  now: number,
  policy: LockPolicy = DEFAULT_LOCK_POLICY,
): FailureOutcome {
  const failedAttempts = state.failedAttempts + 1;
  const lockoutMs = lockoutForFailures(failedAttempts, policy);
  const mustSignOut = failedAttempts >= policy.failuresBeforeSignOut;

  return {
    state: {
      ...state,
      failedAttempts,
      lockedUntil: lockoutMs > 0 ? now + lockoutMs : (state.lockedUntil ?? null),
    },
    lockoutMs,
    mustSignOut,
  };
}

export function recordSuccess(state: LockState, now: number): LockState {
  return { ...state, failedAttempts: 0, lockedUntil: null, lastUnlockedAt: now, backgroundedAt: null };
}

/** Called when the app goes to the background; `now` is the moment it left the foreground. */
export function recordBackgrounded(state: LockState, now: number): LockState {
  return { ...state, backgroundedAt: now };
}

export type AuthMethod = 'BIOMETRIC' | 'PASSCODE';

/**
 * Methods the lock screen may offer, best first.
 *
 * Biometrics are only offered when the hardware exists *and* something is enrolled;
 * otherwise the device passcode is the documented fallback. There is deliberately no
 * third option — a custom PIN would be a second secret to forget.
 */
export function availableMethods(state: LockState): AuthMethod[] {
  const biometricsUsable = state.biometricsAvailable && state.biometricsEnrolled;
  return biometricsUsable ? ['BIOMETRIC', 'PASSCODE'] : ['PASSCODE'];
}

export type AuthPrompt =
  | { kind: 'UNLOCK_BIOMETRIC'; fallback: 'PASSCODE' }
  | { kind: 'UNLOCK_PASSCODE'; reason: 'NO_BIOMETRICS' | 'NOT_ENROLLED' | 'BIOMETRIC_FAILED' }
  | { kind: 'WAIT'; retryAfterSeconds: number; fallback: AuthMethod }
  | { kind: 'SIGN_IN'; reason: 'TOO_MANY_FAILURES' }
  | { kind: 'NONE'; reason: 'LOCK_DISABLED' | 'ALREADY_UNLOCKED' };

/** What the lock screen should render next, and what it should try first. */
export function nextAuthPrompt(
  state: LockState,
  now: number,
  policy: LockPolicy = DEFAULT_LOCK_POLICY,
  biometricFailureHint = false,
): AuthPrompt {
  if (!state.enabled) return { kind: 'NONE', reason: 'LOCK_DISABLED' };

  if (state.failedAttempts >= policy.failuresBeforeSignOut) {
    return { kind: 'SIGN_IN', reason: 'TOO_MANY_FAILURES' };
  }

  const decision = shouldLock(state, now, policy);
  if (!decision.locked) return { kind: 'NONE', reason: 'ALREADY_UNLOCKED' };

  if (decision.reason === 'LOCKED_OUT') {
    return {
      kind: 'WAIT',
      retryAfterSeconds: decision.retryAfterSeconds ?? 0,
      fallback: availableMethods(state)[0],
    };
  }

  if (biometricFailureHint) {
    return { kind: 'UNLOCK_PASSCODE', reason: 'BIOMETRIC_FAILED' };
  }

  if (!state.biometricsAvailable) {
    return { kind: 'UNLOCK_PASSCODE', reason: 'NO_BIOMETRICS' };
  }
  if (!state.biometricsEnrolled) {
    return { kind: 'UNLOCK_PASSCODE', reason: 'NOT_ENROLLED' };
  }

  return { kind: 'UNLOCK_BIOMETRIC', fallback: 'PASSCODE' };
}

/**
 * Enabling the lock is refused when the device cannot satisfy it — otherwise the user would
 * believe the app is protected while any holder of the unlocked phone can open it.
 */
export function canEnableLock(platformSupportsPasscode: boolean): { ok: true } | { ok: false; reason: string } {
  if (!platformSupportsPasscode) {
    return { ok: false, reason: 'This device has no passcode. Set one before enabling the app lock.' };
  }
  return { ok: true };
}
