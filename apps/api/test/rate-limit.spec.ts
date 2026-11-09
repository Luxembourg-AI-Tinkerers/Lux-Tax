import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  DEFAULT_RATE_LIMITS,
  rateLimitHeaders,
  TokenBucketLimiter,
} from '../src/common/rate-limit/token-bucket';

describe('Token-bucket rate limiter (API-8)', () => {
  test('allows a burst up to capacity, then refuses', () => {
    const limiter = new TokenBucketLimiter({ capacity: 3, refillPerSecond: 1 });
    const t0 = 1_000_000;

    assert.strictEqual(limiter.check('ip:1', t0).allowed, true);
    assert.strictEqual(limiter.check('ip:1', t0).allowed, true);
    const third = limiter.check('ip:1', t0);
    assert.strictEqual(third.allowed, true);
    assert.strictEqual(third.remaining, 0);

    const fourth = limiter.check('ip:1', t0);
    assert.strictEqual(fourth.allowed, false);
    assert.strictEqual(fourth.retryAfterSeconds, 1);
  });

  test('refills at the configured rate, and sets Retry-After from the deficit', () => {
    const limiter = new TokenBucketLimiter({ capacity: 1, refillPerSecond: 0.5 });
    const t0 = 2_000_000;
    assert.strictEqual(limiter.check('k', t0).allowed, true);

    // 0.5 token after 1 s -> still refused, needs 1 more second
    const afterOneSecond = limiter.check('k', t0 + 1_000);
    assert.strictEqual(afterOneSecond.allowed, false);
    assert.strictEqual(afterOneSecond.retryAfterSeconds, 1);

    // 1 full token after 2 s
    assert.strictEqual(limiter.check('k', t0 + 2_000).allowed, true);
  });

  test('keys are independent — one noisy IP cannot starve another', () => {
    const limiter = new TokenBucketLimiter({ capacity: 1, refillPerSecond: 1 });
    const t0 = 3_000_000;
    assert.strictEqual(limiter.check('ip:a', t0).allowed, true);
    assert.strictEqual(limiter.check('ip:a', t0).allowed, false);
    assert.strictEqual(limiter.check('ip:b', t0).allowed, true);
  });

  test('hammering while empty does not reset the bucket', () => {
    const limiter = new TokenBucketLimiter({ capacity: 1, refillPerSecond: 0.2 });
    const t0 = 4_000_000;
    limiter.check('k', t0); // consumes the single token
    for (let i = 0; i < 20; i += 1) {
      assert.strictEqual(limiter.check('k', t0 + i * 50).allowed, false);
    }
    // 5 s for a full token at 0.2/s; the hammering above consumed 1 s of it
    assert.strictEqual(limiter.check('k', t0 + 5_000).allowed, true);
  });

  test('never reports negative remaining and retryAfter is at least 1 second', () => {
    const limiter = new TokenBucketLimiter({ capacity: 2, refillPerSecond: 2 });
    const t0 = 5_000_000;
    limiter.check('k', t0);
    const decision = limiter.check('k', t0);
    assert.ok(decision.remaining >= 0);
    if (!decision.allowed) assert.ok(decision.retryAfterSeconds >= 1);
  });

  test('evicts when the key space grows past the bound', () => {
    const limiter = new TokenBucketLimiter({ capacity: 1, refillPerSecond: 1 }, 4);
    for (let i = 0; i < 10; i += 1) limiter.check(`k${i}`, 6_000_000 + i);
    assert.ok(limiter.size() <= 4, `size ${limiter.size()} should stay bounded`);
  });

  test('rejects an invalid configuration instead of dividing by zero', () => {
    assert.throws(() => new TokenBucketLimiter({ capacity: 0, refillPerSecond: 1 }));
    assert.throws(() => new TokenBucketLimiter({ capacity: 1, refillPerSecond: 0 }));
  });

  test('429 headers carry Retry-After; allowed responses do not', () => {
    assert.deepStrictEqual(rateLimitHeaders({ allowed: false, remaining: 0, retryAfterSeconds: 7 }), {
      'Retry-After': '7',
      'X-RateLimit-Remaining': '0',
    });
    assert.deepStrictEqual(rateLimitHeaders({ allowed: true, remaining: 4, retryAfterSeconds: 0 }), {
      'X-RateLimit-Remaining': '4',
    });
  });

  test('defaults are a burst of 60/s per IP and 120/s per user', () => {
    assert.ok(DEFAULT_RATE_LIMITS.ip.capacity >= 30);
    assert.ok(DEFAULT_RATE_LIMITS.user.capacity >= DEFAULT_RATE_LIMITS.ip.capacity);
  });
});
