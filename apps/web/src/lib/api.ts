import { LuxTaxApiClient } from '@luxtax/api-client';
import type { AuthResponseDto } from '@luxtax/contracts';

/**
 * One base URL for every call the web client makes, logout included.
 *
 * A literal `http://localhost:3001` default breaks every origin that is not the
 * API host itself: a phone opening http://192.168.0.195:3000 called its own
 * localhost and failed. The API listens on port 3001 of the same machine as the
 * web app, so the page's hostname is the correct default; NEXT_PUBLIC_API_URL
 * still wins when a deployment splits the two hosts.
 */
const API_PORT = '3001';

function defaultApiBaseUrl(): string {
  if (typeof window === 'undefined' || !window.location?.hostname) {
    return `http://localhost:${API_PORT}`;
  }
  return `${window.location.protocol}//${window.location.hostname}:${API_PORT}`;
}
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || defaultApiBaseUrl();

export const ACCESS_TOKEN_KEY = 'luxtax_access_token';
export const REFRESH_TOKEN_KEY = 'luxtax_refresh_token';
export const LOGOUT_URL = `${API_BASE_URL}/api/auth/logout`;

const hasWindow = () => typeof window !== 'undefined';

export function readStoredToken(key: string): string | null {
  return hasWindow() ? localStorage.getItem(key) : null;
}

export function storeSession(tokens: AuthResponseDto['tokens']): void {
  if (!hasWindow()) return;
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

export function clearSession(): void {
  if (!hasWindow()) return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

/**
 * Renews the access token from the stored refresh token, one call at a time:
 * the dashboard loads several endpoints in parallel and they all see the same
 * 401. Returns the new access token, or null when the session is gone.
 */
let renewal: Promise<string | null> | null = null;

async function renewSession(): Promise<string | null> {
  const refreshToken = readStoredToken(REFRESH_TOKEN_KEY);
  if (!refreshToken) return null;

  // Drop the expired access token before calling the refresh endpoint: it must
  // not be sent as a bearer, and the 401 that endpoint may answer must not
  // re-enter this path (the client only renews authenticated requests).
  if (hasWindow()) localStorage.removeItem(ACCESS_TOKEN_KEY);

  const res = await apiClient.refreshToken({ refreshToken });
  if (!res.data) return null;
  storeSession(res.data.tokens);
  return res.data.tokens.accessToken;
}

export const apiClient = new LuxTaxApiClient({
  baseUrl: API_BASE_URL,
  getAccessToken: () => readStoredToken(ACCESS_TOKEN_KEY),
  refreshAccessToken: () => {
    if (!renewal) {
      renewal = renewSession().finally(() => {
        renewal = null;
      });
    }
    return renewal;
  },
  // Reached only after a renewal attempt failed (or no refresh token exists):
  // the client never reports an unauthenticated request here, so a wrong
  // password stays on the login page.
  onUnauthorized: () => {
    if (!hasWindow()) return;
    clearSession();
    window.location.href = '/login';
  },
});

/**
 * Download the ACD annex PDF produced by the API for a filing package.
 * Uses a blob download because the endpoint is JWT-protected.
 */
export async function downloadAnnexPdf(workspaceId: string): Promise<void> {
  const token = readStoredToken(ACCESS_TOKEN_KEY);
  const response = await fetch(
    `${API_BASE_URL}/api/workspaces/${workspaceId}/filing-package/annexes.pdf`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );

  if (!response.ok) {
    throw new Error(`Annex PDF could not be generated (HTTP ${response.status}).`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `luxtax-annexes-${workspaceId.slice(0, 8)}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
