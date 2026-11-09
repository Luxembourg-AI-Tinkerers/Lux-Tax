/**
 * Token-bucket rate limiting (API-8).
 *
 * Deliberately dependency-free and clock-injected so the policy can be unit-tested
 * without Nest, Redis or a database. The API composes two limiters: one keyed by
 * client IP (protects the process) and one by authenticated user (protects a
 * tenant from a runaway client).
 */

export interface BucketConfig {
  /** Burst size: how many requests may be made back-to-back. */
  readonly capacity: number;
  /** Sustained rate, tokens per second. */
  readonly refillPerSecond: number;
}

export interface RateDecision {
  readonly allowed: boolean;
  /** Whole tokens left after this call (never negative). */
  readonly remaining: number;
  /** Seconds to wait before retrying; 0 when allowed. */
  readonly retryAfterSeconds: number;
}

interface BucketState {
  tokens: number;
  updatedAt: number;
}

/**
 * In-memory token bucket per key.
 *
 * Eviction: when the map exceeds `maxKeys`, the least-recently-updated half is
 * dropped. That bounds memory under a scan without needing a background sweeper,
 * and the cost of a dropped bucket is only a fresh burst allowance.
 */
export class TokenBucketLimiter {
  private readonly buckets = new Map<string, BucketState>();

  constructor(
    private readonly config: BucketConfig,
    private readonly maxKeys = 10_000,
  ) {
    if (config.capacity <= 0) throw new Error('capacity must be positive');
    if (config.refillPerSecond <= 0) throw new Error('refillPerSecond must be positive');
  }

  check(key: string, nowMs: number = Date.now()): RateDecision {
    const state = this.buckets.get(key) ?? { tokens: this.config.capacity, updatedAt: nowMs };

    const elapsedSeconds = Math.max(0, (nowMs - state.updatedAt) / 1000);
    const refilled = Math.min(
      this.config.capacity,
      state.tokens + elapsedSeconds * this.config.refillPerSecond,
    );

    if (refilled >= 1) {
      const remaining = refilled - 1;
      this.buckets.set(key, { tokens: remaining, updatedAt: nowMs });
      this.evictIfNeeded();
      return { allowed: true, remaining: Math.floor(remaining), retryAfterSeconds: 0 };
    }

    // Not enough for a request: keep the fractional state so a caller cannot
    // reset the bucket by hammering it.
    this.buckets.set(key, { tokens: refilled, updatedAt: nowMs });
    this.evictIfNeeded();

    const deficit = 1 - refilled;
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(deficit / this.config.refillPerSecond)),
    };
  }

  /** Test/debug helper. */
  size(): number {
    return this.buckets.size;
  }

  reset(): void {
    this.buckets.clear();
  }

  private evictIfNeeded(): void {
    if (this.buckets.size <= this.maxKeys) return;
    const entries = [...this.buckets.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt);
    const drop = Math.ceil(entries.length / 2);
    for (let i = 0; i < drop; i += 1) this.buckets.delete(entries[i][0]);
  }
}

export interface RateLimitConfig {
  readonly ip: BucketConfig;
  readonly user: BucketConfig;
}

/** Conservative defaults; override with RATE_LIMIT_* environment variables. */
export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  ip: { capacity: 60, refillPerSecond: 1 },
  user: { capacity: 120, refillPerSecond: 2 },
};

/**
 * Header set on a 429 so a well-behaved client backs off instead of retrying
 * immediately. Kept as a plain object so the guard can spread it into the reply.
 */
export function rateLimitHeaders(decision: RateDecision): Record<string, string> {
  if (decision.allowed) return { 'X-RateLimit-Remaining': String(decision.remaining) };
  return {
    'Retry-After': String(decision.retryAfterSeconds),
    'X-RateLimit-Remaining': '0',
  };
}
