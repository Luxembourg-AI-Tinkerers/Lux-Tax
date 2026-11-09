import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  backoffMs,
  downloadAnnexes,
  isRetryableStatus,
  parseRetryAfter,
  type DownloadOptions,
} from '../src/lib/package-download';

const BASE: Omit<DownloadOptions, 'fetchImpl' | 'getAccessToken'> = {
  baseUrl: 'https://api.example.lu',
  workspaceId: 'ws-1',
  taxYear: 2025,
  hashPrefix: 'abcdef0123',
  maxAttempts: 3,
  baseDelayMs: 10,
};

function response(status: number, headers: Record<string, string> = {}, body?: Uint8Array): Response {
  const map = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => map.get(name.toLowerCase()) ?? null },
    arrayBuffer: async () => (body ?? new Uint8Array()).buffer,
  } as unknown as Response;
}

const asPdf = (payload = new Uint8Array([37, 80, 68, 70])) =>
  response(200, { 'content-type': 'application/pdf' }, payload);

describe('Authenticated package download (MOB-6)', () => {
  test('refuses to call the network without a token', async () => {
    let called = false;
    const result = await downloadAnnexes(
      {
        ...BASE,
        getAccessToken: () => null,
        fetchImpl: (async () => {
          called = true;
          return asPdf();
        }) as unknown as typeof fetch,
        sleep: async () => undefined,
      },
      async () => undefined,
    );

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.reason, 'UNAUTHORIZED');
      assert.strictEqual(result.attempts, 0);
    }
    assert.strictEqual(called, false, 'must not hit the network without a token');
  });

  test('sends the bearer token and the PDF Accept header', async () => {
    let seenHeaders: Record<string, string> = {};
    let seenUrl = '';

    const result = await downloadAnnexes(
      {
        ...BASE,
        getAccessToken: async () => 'token-123',
        fetchImpl: (async (url: string, init: RequestInit) => {
          seenUrl = url;
          seenHeaders = init.headers as Record<string, string>;
          return asPdf();
        }) as unknown as typeof fetch,
        sleep: async () => undefined,
      },
      async () => undefined,
    );

    assert.strictEqual(result.ok, true);
    assert.strictEqual(seenHeaders.Authorization, 'Bearer token-123');
    assert.strictEqual(seenHeaders.Accept, 'application/pdf');
    assert.ok(seenUrl.endsWith('/api/workspaces/ws-1/filing-package/annexes.pdf'));
  });

  test('saves the bytes under a safe file name', async () => {
    let saved: { fileName: string; bytes: Uint8Array } | null = null;

    const result = await downloadAnnexes(
      { ...BASE, getAccessToken: () => 't', fetchImpl: (async () => asPdf()) as unknown as typeof fetch, sleep: async () => undefined },
      async (file) => {
        saved = file;
      },
    );

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.fileName, 'luxtax-annexes-2025-abcdef01.pdf');
      assert.strictEqual(result.bytes, 4);
    }
    assert.strictEqual(saved!.fileName, 'luxtax-annexes-2025-abcdef01.pdf');
  });

  test('a 400 means the package was never generated, and is not retried', async () => {
    let calls = 0;
    const result = await downloadAnnexes(
      {
        ...BASE,
        getAccessToken: () => 't',
        fetchImpl: (async () => {
          calls += 1;
          return response(400);
        }) as unknown as typeof fetch,
        sleep: async () => undefined,
      },
      async () => undefined,
    );

    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.strictEqual(result.reason, 'NO_PACKAGE');
    assert.strictEqual(calls, 1);
  });

  test('401 is a hard stop — retrying would just replay a bad token', async () => {
    let calls = 0;
    const result = await downloadAnnexes(
      {
        ...BASE,
        getAccessToken: () => 'expired',
        fetchImpl: (async () => {
          calls += 1;
          return response(401);
        }) as unknown as typeof fetch,
        sleep: async () => undefined,
      },
      async () => undefined,
    );

    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.strictEqual(result.reason, 'UNAUTHORIZED');
    assert.strictEqual(calls, 1);
  });

  test('404 is not retried', async () => {
    let calls = 0;
    const result = await downloadAnnexes(
      {
        ...BASE,
        getAccessToken: () => 't',
        fetchImpl: (async () => {
          calls += 1;
          return response(404);
        }) as unknown as typeof fetch,
        sleep: async () => undefined,
      },
      async () => undefined,
    );
    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.strictEqual(result.reason, 'NOT_FOUND');
    assert.strictEqual(calls, 1);
  });

  test('a 500 is retried and can succeed on the second attempt', async () => {
    let calls = 0;
    const waits: number[] = [];

    const result = await downloadAnnexes(
      {
        ...BASE,
        getAccessToken: () => 't',
        fetchImpl: (async () => {
          calls += 1;
          return calls === 1 ? response(500) : asPdf();
        }) as unknown as typeof fetch,
        sleep: async (ms) => void waits.push(ms),
      },
      async () => undefined,
    );

    assert.strictEqual(result.ok, true);
    if (result.ok) assert.strictEqual(result.attempts, 2);
    assert.strictEqual(calls, 2);
    assert.deepStrictEqual(waits, [backoffMs(1, 10)]);
  });

  test('gives up after maxAttempts and reports the reason', async () => {
    let calls = 0;
    const result = await downloadAnnexes(
      {
        ...BASE,
        getAccessToken: () => 't',
        fetchImpl: (async () => {
          calls += 1;
          return response(503);
        }) as unknown as typeof fetch,
        sleep: async () => undefined,
      },
      async () => undefined,
    );

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.reason, 'SERVER');
      assert.strictEqual(result.attempts, 3);
    }
    assert.strictEqual(calls, 3);
  });

  test('429 honours Retry-After instead of the exponential delay', async () => {
    let calls = 0;
    const waits: number[] = [];

    const result = await downloadAnnexes(
      {
        ...BASE,
        getAccessToken: () => 't',
        fetchImpl: (async () => {
          calls += 1;
          return calls === 1 ? response(429, { 'retry-after': '2' }) : asPdf();
        }) as unknown as typeof fetch,
        sleep: async (ms) => void waits.push(ms),
      },
      async () => undefined,
    );

    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(waits, [2_000]);
  });

  test('network errors are retried, then surface as NETWORK', async () => {
    let calls = 0;
    const result = await downloadAnnexes(
      {
        ...BASE,
        getAccessToken: () => 't',
        fetchImpl: (async () => {
          calls += 1;
          throw new Error('Network request failed');
        }) as unknown as typeof fetch,
        sleep: async () => undefined,
      },
      async () => undefined,
    );

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.reason, 'NETWORK');
      assert.match(result.message, /Network request failed/);
    }
    assert.strictEqual(calls, 3);
  });

  test('a 200 that is not a PDF is rejected, so an HTML error page is never saved', async () => {
    let saved = false;
    const result = await downloadAnnexes(
      {
        ...BASE,
        getAccessToken: () => 't',
        fetchImpl: (async () => response(200, { 'content-type': 'text/html' })) as unknown as typeof fetch,
        sleep: async () => undefined,
      },
      async () => {
        saved = true;
      },
    );

    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.strictEqual(result.reason, 'INVALID_CONTENT');
    assert.strictEqual(saved, false);
  });

  test('retry classification and backoff are explicit', () => {
    assert.strictEqual(isRetryableStatus(408), true);
    assert.strictEqual(isRetryableStatus(429), true);
    assert.strictEqual(isRetryableStatus(500), true);
    assert.strictEqual(isRetryableStatus(503), true);
    assert.strictEqual(isRetryableStatus(400), false);
    assert.strictEqual(isRetryableStatus(401), false);
    assert.strictEqual(isRetryableStatus(404), false);

    assert.strictEqual(backoffMs(1), 500);
    assert.strictEqual(backoffMs(2), 1_000);
    assert.strictEqual(backoffMs(3), 2_000);
  });

  test('Retry-After parses seconds, HTTP dates and garbage', () => {
    assert.strictEqual(parseRetryAfter('5'), 5);
    assert.strictEqual(parseRetryAfter(null), undefined);
    assert.strictEqual(parseRetryAfter('not-a-number'), undefined);
    const future = new Date(Date.now() + 3_000).toUTCString();
    const parsed = parseRetryAfter(future);
    assert.ok(parsed === 2 || parsed === 3, `expected ~3s, got ${parsed}`);
  });
});
