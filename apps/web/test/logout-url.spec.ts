/**
 * Sign-out used to POST to a literal `http://localhost:3001`, so in any deployed
 * environment the refresh token was never revoked (and the browser tried to
 * reach the developer's machine).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('logout endpoint', () => {
  it('is built from the configured API base URL, never from a hardcoded host', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://tax-api.example.test';
    const { API_BASE_URL, LOGOUT_URL } = await import('../src/lib/api');

    assert.equal(API_BASE_URL, 'https://tax-api.example.test');
    assert.equal(LOGOUT_URL, 'https://tax-api.example.test/api/auth/logout');
    assert.ok(!LOGOUT_URL.includes('localhost'), LOGOUT_URL);
  });
});
