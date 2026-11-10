/**
 * The refresh flow, end to end through the real `apiClient`: a 401 on an
 * authenticated request renews the session from the stored refresh token, saves
 * the new pair and replays the request — instead of throwing the user back to
 * /login in the middle of a form. Only a failed renewal navigates.
 *
 * Storage and `fetch` are stand-ins; the client, its renewal callback and the
 * retry are the ones the app ships.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

const globals = globalThis as Record<string, unknown>;
const originalFetch = globalThis.fetch;
const saved = { window: globals.window, localStorage: globals.localStorage };

interface Call {
  url: string;
  method: string;
  authorization: string | null;
  body: unknown;
}

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    json: async () => body,
  };
}

/** Installs storage holding `access-1` / `refresh-1` and a window that records navigation. */
function installSession(): { navigate: () => string } {
  const store = new Map<string, string>();
  store.set('luxtax_access_token', 'access-1');
  store.set('luxtax_refresh_token', 'refresh-1');
  globals.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  const location = { href: '', search: '' };
  globals.window = {
    location,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  return { navigate: () => location.href };
}

function stubApi(options: { refreshSucceeds: boolean }): Call[] {
  const calls: Call[] = [];
  (globalThis as { fetch: unknown }).fetch = async (url: unknown, init: unknown) => {
    const request = (init ?? {}) as { method?: string; body?: string; headers?: Record<string, string> };
    const target = String(url);
    const authorization = request.headers?.Authorization ?? null;
    calls.push({
      url: target,
      method: request.method ?? 'GET',
      authorization,
      body: request.body ? JSON.parse(request.body) : undefined,
    });

    if (target.endsWith('/api/auth/refresh')) {
      return options.refreshSucceeds
        ? reply(200, {
            user: { id: 'user-1' },
            tokens: { accessToken: 'access-2', refreshToken: 'refresh-2', expiresIn: 900 },
          })
        : reply(401, { message: 'Refresh token revoked' });
    }
    if (target.endsWith('/api/users/me')) {
      if (authorization === 'Bearer access-2') return reply(200, { id: 'user-1' });
      return reply(401, { message: 'Access token expired' });
    }
    return reply(500, { message: `unexpected request ${target}` });
  };
  return calls;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  globals.window = saved.window;
  globals.localStorage = saved.localStorage;
});

describe('apiClient — session renewal', () => {
  it('renews the token, stores the new pair and replays the request', async () => {
    const session = installSession();
    const calls = stubApi({ refreshSucceeds: true });
    const { apiClient } = await import('../src/lib/api');

    const res = await apiClient.getMe();

    assert.deepEqual(res.data, { id: 'user-1' });
    assert.equal(session.navigate(), '', 'a renewed session must not navigate');
    assert.equal(globals.localStorage && (globals.localStorage as Storage).getItem('luxtax_access_token'), 'access-2');
    assert.equal((globals.localStorage as Storage).getItem('luxtax_refresh_token'), 'refresh-2');

    const refresh = calls.find((call) => call.url.endsWith('/api/auth/refresh'));
    assert.ok(refresh, JSON.stringify(calls));
    assert.equal(refresh!.authorization, null, 'the refresh call must not carry the expired bearer');
    assert.deepEqual(refresh!.body, { refreshToken: 'refresh-1' });
  });

  it('clears the session and navigates once the renewal is refused', async () => {
    const session = installSession();
    stubApi({ refreshSucceeds: false });
    const { apiClient } = await import('../src/lib/api');

    const res = await apiClient.getMe();

    assert.equal(res.status, 401);
    assert.equal(session.navigate(), '/login');
    assert.equal((globals.localStorage as Storage).getItem('luxtax_access_token'), null);
    assert.equal((globals.localStorage as Storage).getItem('luxtax_refresh_token'), null);
  });
});
