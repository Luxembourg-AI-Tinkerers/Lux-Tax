/**
 * `LuxTaxApiClient` is where a 401 becomes either "your password is wrong" or
 * "your session ended". The client used to treat every 401 as the second case:
 * `onUnauthorized` fired for `POST /api/auth/login` too, and the web client
 * turns that callback into a hard navigation to /login — which wiped the login
 * form before it could show the server's message.
 *
 * `fetch` is stubbed (the client's only I/O). The request path, the header the
 * client attaches, the renewal callback and the replay are the real ones.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { LuxTaxApiClient } from '@luxtax/api-client';

interface Reply {
  status: number;
  body?: unknown;
}

interface Call {
  url: string;
  authorization: string | null;
}

const originalFetch = globalThis.fetch;

/** Replies in order; the last one repeats once the queue is exhausted. */
function stubFetch(replies: Reply[]): Call[] {
  const calls: Call[] = [];
  let index = 0;
  (globalThis as { fetch: unknown }).fetch = async (url: unknown, init: unknown) => {
    const headers = ((init ?? {}) as { headers?: Record<string, string> }).headers ?? {};
    calls.push({ url: String(url), authorization: headers.Authorization ?? null });
    const reply = replies[Math.min(index, replies.length - 1)];
    index += 1;
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      statusText: `HTTP ${reply.status}`,
      json: async () => reply.body ?? {},
    };
  };
  return calls;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('LuxTaxApiClient — a 401 only navigates when the session is the problem', () => {
  it('returns the message of a rejected login instead of reporting an expired session', async () => {
    const calls = stubFetch([{ status: 401, body: { message: 'Invalid email or password' } }]);
    let unauthorized = 0;
    const client = new LuxTaxApiClient({
      baseUrl: 'http://api.test',
      getAccessToken: () => null,
      refreshAccessToken: async () => 'should-not-be-used',
      onUnauthorized: () => {
        unauthorized += 1;
      },
    });

    const res = await client.login({ email: 'spouse@example.lu', password: 'wrong' });

    assert.equal(res.error, 'Invalid email or password');
    assert.equal(res.status, 401);
    assert.equal(unauthorized, 0, 'a credential failure must not navigate the page');
    assert.equal(calls.length, 1, 'a credential failure must not be replayed');
    assert.equal(calls[0]?.authorization, null, 'login must not carry a bearer token');
  });

  it('renews once and replays the request with the new access token', async () => {
    const calls = stubFetch([{ status: 401 }, { status: 200, body: { id: 'user-1' } }]);
    let unauthorized = 0;
    const client = new LuxTaxApiClient({
      baseUrl: 'http://api.test',
      getAccessToken: () => 'expired-token',
      refreshAccessToken: async () => 'fresh-token',
      onUnauthorized: () => {
        unauthorized += 1;
      },
    });

    const res = await client.getMe();

    assert.deepEqual(res.data, { id: 'user-1' });
    assert.equal(calls.length, 2, JSON.stringify(calls));
    assert.equal(calls[0]?.authorization, 'Bearer expired-token');
    assert.equal(calls[1]?.authorization, 'Bearer fresh-token');
    assert.equal(unauthorized, 0, 'a successful renewal must not navigate');
  });

  it('navigates only after the renewal itself failed', async () => {
    const calls = stubFetch([{ status: 401 }]);
    let unauthorized = 0;
    const client = new LuxTaxApiClient({
      baseUrl: 'http://api.test',
      getAccessToken: () => 'expired-token',
      refreshAccessToken: async () => null,
      onUnauthorized: () => {
        unauthorized += 1;
      },
    });

    const res = await client.getMe();

    assert.equal(res.status, 401);
    assert.equal(unauthorized, 1);
    assert.equal(calls.length, 1, 'no replay without a new token');
  });

  it('gives up after one replay, never looping on a token the API keeps rejecting', async () => {
    const calls = stubFetch([{ status: 401 }]);
    let unauthorized = 0;
    let renewals = 0;
    const client = new LuxTaxApiClient({
      baseUrl: 'http://api.test',
      getAccessToken: () => 'expired-token',
      refreshAccessToken: async () => {
        renewals += 1;
        return 'still-rejected';
      },
      onUnauthorized: () => {
        unauthorized += 1;
      },
    });

    await client.getMe();

    assert.equal(renewals, 1, 'exactly one renewal attempt per request');
    assert.equal(calls.length, 2, 'exactly one replay');
    assert.equal(unauthorized, 1);
  });

  it('keeps treating an authenticated 401 as unauthorized when no renewal is configured', async () => {
    stubFetch([{ status: 401 }]);
    let unauthorized = 0;
    const client = new LuxTaxApiClient({
      baseUrl: 'http://api.test',
      getAccessToken: () => 'expired-token',
      onUnauthorized: () => {
        unauthorized += 1;
      },
    });

    await client.getMe();

    assert.equal(unauthorized, 1);
  });

  it('does not attach a bearer to a request it had no token for', async () => {
    const calls = stubFetch([{ status: 200, body: [] }]);
    let unauthorized = 0;
    const client = new LuxTaxApiClient({
      baseUrl: 'http://api.test',
      getAccessToken: () => null,
      onUnauthorized: () => {
        unauthorized += 1;
      },
    });

    await client.getHouseholds();

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.authorization, null);
    assert.equal(unauthorized, 0);
  });
});
