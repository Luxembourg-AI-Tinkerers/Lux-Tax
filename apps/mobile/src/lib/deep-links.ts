/**
 * Deep-link parsing (MOB-8).
 *
 * A deep link is untrusted input that decides which workspace the app opens. Parsing it
 * as a pure function keeps three risks out of the screens:
 *
 *  - scheme confusion: `javascript:`, `data:`, `file:` and unknown apps must never route;
 *  - authority spoofing: `luxtax://user@host/...` looks like our scheme but points elsewhere;
 *  - path injection: a workspace id is interpolated into `/api/workspaces/<id>/...`, so it
 *    must be a UUID before it is ever used.
 */

export const APP_SCHEME = 'luxtax';
export const UNIVERSAL_HOST = 'app.luxtax.lu';

export type DeepLinkRoute =
  | { name: 'WORKSPACE_ESTIMATE'; workspaceId: string }
  | { name: 'WORKSPACE_DOCUMENTS'; workspaceId: string }
  | { name: 'WORKSPACE_TASKS'; workspaceId: string }
  | { name: 'INVITE'; token: string }
  | { name: 'RESET_PASSWORD'; token: string }
  | { name: 'NOTIFICATIONS' }
  | { name: 'HOME' };

export type DeepLinkFailure =
  | 'EMPTY'
  | 'TOO_LONG'
  | 'UNSUPPORTED_SCHEME'
  | 'UNTRUSTED_HOST'
  | 'INVALID_AUTHORITY'
  | 'UNKNOWN_ROUTE'
  | 'INVALID_ID'
  | 'INVALID_TOKEN';

export type DeepLinkResult =
  | { ok: true; route: DeepLinkRoute; raw: string }
  | { ok: false; reason: DeepLinkFailure };

const MAX_URL_LENGTH = 2_048;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{16,128}$/;

export function isWorkspaceId(value: string): boolean {
  return UUID.test(value);
}

/** Invite and reset tokens: URL-safe, 16–128 chars, nothing else. */
export function isOpaqueToken(value: string): boolean {
  return TOKEN.test(value);
}

/** Strips trailing slashes and lowercases the scheme without touching the path case. */
function normalise(raw: string): string {
  return raw.trim();
}

/**
 * Parses an incoming URL.
 *
 * Accepted:
 *  - `luxtax://workspace/<uuid>/(estimate|documents|tasks)`
 *  - `luxtax://invite/<token>` and `luxtax://reset-password?token=<token>`
 *  - `luxtax://notifications`, `luxtax://` and `luxtax://home`
 *  - the same paths under `https://app.luxtax.lu/...`
 */
export function parseDeepLink(input: string | null | undefined): DeepLinkResult {
  if (!input || typeof input !== 'string') return { ok: false, reason: 'EMPTY' };

  const raw = normalise(input);
  if (raw.length === 0) return { ok: false, reason: 'EMPTY' };
  if (raw.length > MAX_URL_LENGTH) return { ok: false, reason: 'TOO_LONG' };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'UNKNOWN_ROUTE' };
  }

  const scheme = url.protocol.replace(':', '').toLowerCase();

  if (scheme === 'https') {
    if (url.hostname.toLowerCase() !== UNIVERSAL_HOST) {
      return { ok: false, reason: 'UNTRUSTED_HOST' };
    }
  } else if (scheme !== APP_SCHEME) {
    return { ok: false, reason: 'UNSUPPORTED_SCHEME' };
  } else if (url.username || url.password) {
    // `luxtax://user@host/...` — our scheme never carries credentials.
    return { ok: false, reason: 'INVALID_AUTHORITY' };
  }

  // With a custom scheme the first segment is parsed as the *host*:
  // `luxtax://notifications` → hostname "notifications", pathname "". Put it back so
  // the route grammar is the same for `luxtax://x/y` and `https://host/x/y`.
  const pathSegments = url.pathname.split('/').filter((segment) => segment.length > 0);
  const segments =
    scheme === APP_SCHEME && url.hostname ? [decodeURIComponent(url.hostname), ...pathSegments] : pathSegments;
  const [first, second, third] = segments;

  if (!first) {
    return { ok: true, route: { name: 'HOME' }, raw };
  }

  const head = first.toLowerCase();

  if (head === 'home') {
    return { ok: true, route: { name: 'HOME' }, raw };
  }

  if (head === 'notifications' && segments.length === 1) {
    return { ok: true, route: { name: 'NOTIFICATIONS' }, raw };
  }

  if (head === 'workspace') {
    if (!second || !third) return { ok: false, reason: 'UNKNOWN_ROUTE' };
    if (!isWorkspaceId(second)) return { ok: false, reason: 'INVALID_ID' };

    const view = third.toLowerCase();
    if (view === 'estimate') return { ok: true, route: { name: 'WORKSPACE_ESTIMATE', workspaceId: second }, raw };
    if (view === 'documents') return { ok: true, route: { name: 'WORKSPACE_DOCUMENTS', workspaceId: second }, raw };
    if (view === 'tasks') return { ok: true, route: { name: 'WORKSPACE_TASKS', workspaceId: second }, raw };
    return { ok: false, reason: 'UNKNOWN_ROUTE' };
  }

  if (head === 'invite') {
    if (!second || !isOpaqueToken(second)) return { ok: false, reason: 'INVALID_TOKEN' };
    return { ok: true, route: { name: 'INVITE', token: second }, raw };
  }

  if (head === 'reset-password') {
    const token = url.searchParams.get('token');
    if (!token || !isOpaqueToken(token)) return { ok: false, reason: 'INVALID_TOKEN' };
    return { ok: true, route: { name: 'RESET_PASSWORD', token }, raw };
  }

  return { ok: false, reason: 'UNKNOWN_ROUTE' };
}

/** Builds a link with the app scheme; used for share sheets and tests. */
export function buildDeepLink(route: DeepLinkRoute): string {
  switch (route.name) {
    case 'HOME':
      return `${APP_SCHEME}://home`;
    case 'NOTIFICATIONS':
      return `${APP_SCHEME}://notifications`;
    case 'WORKSPACE_ESTIMATE':
      return `${APP_SCHEME}://workspace/${route.workspaceId}/estimate`;
    case 'WORKSPACE_DOCUMENTS':
      return `${APP_SCHEME}://workspace/${route.workspaceId}/documents`;
    case 'WORKSPACE_TASKS':
      return `${APP_SCHEME}://workspace/${route.workspaceId}/tasks`;
    case 'INVITE':
      return `${APP_SCHEME}://invite/${route.token}`;
    case 'RESET_PASSWORD':
      return `${APP_SCHEME}://reset-password?token=${route.token}`;
  }
}

/**
 * Where a route lands when the user is signed out. Authentication-required routes are
 * kept in `pending` so the app can resume them after login instead of dropping the user
 * on the home tab.
 */
export function requiresAuth(route: DeepLinkRoute): boolean {
  return route.name === 'WORKSPACE_ESTIMATE' || route.name === 'WORKSPACE_DOCUMENTS' || route.name === 'WORKSPACE_TASKS';
}
