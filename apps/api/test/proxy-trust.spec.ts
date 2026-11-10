import { test, describe } from 'node:test';
import assert from 'node:assert';
import { resolveTrustProxy } from '../src/config/proxy-trust';

/**
 * L6. The default matters more than any single branch: an unset or unreadable
 * value must not enable header trust, because `X-Forwarded-For` is
 * client-controlled and both the audit trail and the per-IP rate-limit bucket
 * key on the address it carries.
 */
describe('proxy trust (L6)', () => {
  test('unset means the socket address is the client address', () => {
    assert.strictEqual(resolveTrustProxy(undefined), false);
    assert.strictEqual(resolveTrustProxy(''), false);
    assert.strictEqual(resolveTrustProxy('   '), false);
  });

  test('an explicit false or zero is not trust', () => {
    assert.strictEqual(resolveTrustProxy('false'), false);
    assert.strictEqual(resolveTrustProxy('FALSE'), false);
    assert.strictEqual(resolveTrustProxy('0'), false);
  });

  test('true trusts the header, for a deployment that fronted the API', () => {
    assert.strictEqual(resolveTrustProxy('true'), true);
    assert.strictEqual(resolveTrustProxy('TRUE'), true);
  });

  test('a hop count trusts only the last N proxies', () => {
    const one = resolveTrustProxy('1');
    assert.strictEqual(typeof one, 'function');
    // proxy-addr semantics: hop 0 is the immediate peer.
    assert.strictEqual((one as (a: string, h: number) => boolean)('10.0.0.1', 0), true);
    assert.strictEqual((one as (a: string, h: number) => boolean)('10.0.0.1', 1), false);
  });

  test('a network list trusts the header only for a listed peer', () => {
    const list = resolveTrustProxy('10.0.0.0/8, 192.168.1.1');
    assert.deepStrictEqual(list, ['10.0.0.0/8', '192.168.1.1']);
  });

  test('an unreadable value falls back to no trust rather than to trust', () => {
    // A typo in a deployment variable must not silently enable the header.
    assert.strictEqual(resolveTrustProxy('yes'), false);
    assert.strictEqual(resolveTrustProxy('1,,'), false);
    assert.strictEqual(resolveTrustProxy('-1'), false);
    assert.strictEqual(resolveTrustProxy('ture'), false);
  });
});
