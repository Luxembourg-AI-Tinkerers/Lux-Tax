/**
 * Invitation links point at `/login?redirect=/invite/<token>` and
 * `/register?redirect=…`; neither page read the parameter, so accepting an
 * invitation always landed on the dashboard and the token was lost.
 *
 * The helper also keeps the parameter from turning the login page into an open
 * redirect.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolvePostAuthPath } from '../src/lib/auth-redirect';

describe('resolvePostAuthPath — post-login destination', () => {
  it('returns the requested same-origin path', () => {
    assert.equal(
      resolvePostAuthPath('?redirect=/invite/abc123', '/'),
      '/invite/abc123',
    );
  });

  it('decodes the parameter value', () => {
    assert.equal(
      resolvePostAuthPath('?redirect=%2Finvite%2Fabc123', '/'),
      '/invite/abc123',
    );
  });

  it('falls back when no redirect was asked for', () => {
    assert.equal(resolvePostAuthPath('', '/fallback'), '/fallback');
    assert.equal(resolvePostAuthPath('?email=x%40y.z', '/fallback'), '/fallback');
    assert.equal(resolvePostAuthPath(null, '/fallback'), '/fallback');
  });

  it('refuses an off-site destination', () => {
    assert.equal(resolvePostAuthPath('?redirect=https://evil.example/x', '/fallback'), '/fallback');
    assert.equal(resolvePostAuthPath('?redirect=//evil.example/x', '/fallback'), '/fallback');
    assert.equal(resolvePostAuthPath('?redirect=%2F%5Cevil.example', '/fallback'), '/fallback');
    assert.equal(resolvePostAuthPath('?redirect=invite/abc', '/fallback'), '/fallback');
  });
});
