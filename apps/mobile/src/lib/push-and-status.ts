/**
 * Push-registration and offline-status decisions (MOB-7).
 *
 * Both are *policy* problems, not UI problems: when should the app ask for the
 * notification permission, when is a token worth sending to the server, and what
 * should the banner say given connectivity and queue state. Expressing them as pure
 * functions makes them testable here, where no React Native runtime exists.
 */

// ---------------------------------------------------------------- push registration

export type PushPermission = 'UNDETERMINED' | 'GRANTED' | 'DENIED' | 'PROVISIONAL';

export interface PushState {
  /** Whether the user enabled notifications in app settings. */
  pushEnabled: boolean;
  permission: PushPermission;
  /** Device token currently held, if any. */
  deviceToken?: string | null;
  /** Token the server already knows about. */
  serverToken?: string | null;
}

export type PushAction =
  | { action: 'NONE'; reason: string }
  | { action: 'REQUEST_PERMISSION' }
  | { action: 'SHOW_DISABLED_HINT' }
  | { action: 'FETCH_TOKEN' }
  | { action: 'REGISTER'; token: string }
  | { action: 'DEREGISTER'; token: string };

/**
 * Single step the app should take next. Deliberately returns one action, so the
 * caller cannot accidentally request a permission and register a token in the same
 * pass (a common source of duplicate prompts).
 */
export function nextPushAction(state: PushState): PushAction {
  if (!state.pushEnabled) {
    // Turning notifications off must actively remove the server token.
    if (state.serverToken) return { action: 'DEREGISTER', token: state.serverToken };
    return { action: 'NONE', reason: 'Push disabled by the user.' };
  }

  if (state.permission === 'DENIED') {
    return { action: 'SHOW_DISABLED_HINT' };
  }

  if (state.permission === 'UNDETERMINED') {
    return { action: 'REQUEST_PERMISSION' };
  }

  // GRANTED or PROVISIONAL
  if (!state.deviceToken) {
    return { action: 'FETCH_TOKEN' };
  }

  if (state.deviceToken !== state.serverToken) {
    return { action: 'REGISTER', token: state.deviceToken };
  }

  return { action: 'NONE', reason: 'Token already registered.' };
}

export interface PushServerPayload {
  deviceToken: string;
  platform: 'ios' | 'android' | 'unknown';
  appVersion?: string;
}

/** Payload sent to `POST /api/notifications/devices` (shape kept explicit for tests). */
export function buildRegistrationPayload(
  deviceToken: string,
  platform: string,
  appVersion?: string,
): PushServerPayload {
  const normalisedPlatform: PushServerPayload['platform'] =
    platform === 'ios' || platform === 'android' ? platform : 'unknown';
  return {
    deviceToken,
    platform: normalisedPlatform,
    ...(appVersion ? { appVersion } : {}),
  };
}

/** Registration is idempotent, so a failed send is safe to repeat. */
export function shouldRetryRegistration(result: { ok: boolean; status?: number }): boolean {
  if (result.ok) return false;
  if (result.status === undefined) return true; // transport
  return result.status === 408 || result.status === 429 || result.status >= 500;
}

// ------------------------------------------------------------------- offline banner

export interface OfflineStatusInput {
  isConnected: boolean;
  pendingOperations: number;
  /** Timestamp of the last successful sync, if any. */
  lastSyncedAt?: number | null;
  now: number;
  /** After this long without a sync the banner escalates to STALE. */
  staleAfterMs?: number;
}

export type OfflineLevel = 'ONLINE' | 'PENDING' | 'OFFLINE' | 'STALE';

export interface OfflineStatus {
  level: OfflineLevel;
  title: string;
  detail: string;
  /** True when the banner should be visible at all. */
  visible: boolean;
}

export const DEFAULT_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Banner state, in priority order:
 *  - offline wins over everything (the user needs to know why nothing works);
 *  - then pending operations (they are safe but not yet sent);
 *  - then staleness (connected but data is old);
 *  - otherwise nothing.
 */
export function deriveOfflineStatus(input: OfflineStatusInput): OfflineStatus {
  const staleAfter = input.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const age = input.lastSyncedAt ? input.now - input.lastSyncedAt : null;

  if (!input.isConnected) {
    const queued = input.pendingOperations;
    return {
      level: 'OFFLINE',
      visible: true,
      title: 'Offline',
      detail:
        queued > 0
          ? `${queued} change${queued === 1 ? '' : 's'} will be sent when the connection returns.`
          : 'Showing the last data saved on this device.',
    };
  }

  if (input.pendingOperations > 0) {
    return {
      level: 'PENDING',
      visible: true,
      title: 'Sending…',
      detail: `${input.pendingOperations} queued change${input.pendingOperations === 1 ? '' : 's'} in progress.`,
    };
  }

  if (age !== null && age > staleAfter) {
    const days = Math.floor(age / (24 * 60 * 60 * 1000));
    return {
      level: 'STALE',
      visible: true,
      title: 'Data may be out of date',
      detail: `Last synced ${days} day${days === 1 ? '' : 's'} ago. Pull down to refresh.`,
    };
  }

  return { level: 'ONLINE', visible: false, title: '', detail: '' };
}

/**
 * Reconnect rule: replay only when the banner was showing an offline state and the
 * queue is non-empty. Avoids a replay storm on every connectivity callback.
 */
export function shouldReplayOnReconnect(
  previous: OfflineStatus,
  next: OfflineStatus,
  pendingOperations: number,
): boolean {
  return previous.level === 'OFFLINE' && next.level !== 'OFFLINE' && pendingOperations > 0;
}
