import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import {
  DEFAULT_RATE_LIMITS,
  rateLimitHeaders,
  TokenBucketLimiter,
} from '../rate-limit/token-bucket';

/**
 * Global rate-limit guard (API-8).
 *
 * Two buckets are consulted for every request: one keyed by client IP and one by
 * authenticated user, so a single tenant cannot exhaust the process and a single
 * IP cannot exhaust a tenant. The first refusal wins and returns 429 with
 * `Retry-After`.
 *
 * Off by default (`RATE_LIMIT_ENABLED !== 'true'`): enabling it is an operational
 * decision, and an always-on limiter with fixed numbers would surprise existing
 * integrations.
 */
export function isRateLimitEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.RATE_LIMIT_ENABLED ?? '').toLowerCase() === 'true';
}

function numericEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly ipLimiter: TokenBucketLimiter;
  private readonly userLimiter: TokenBucketLimiter;
  private readonly enabled: boolean;

  constructor() {
    const ipCapacity = numericEnv(process.env.RATE_LIMIT_IP_CAPACITY, DEFAULT_RATE_LIMITS.ip.capacity);
    const ipRate = numericEnv(process.env.RATE_LIMIT_IP_REFILL, DEFAULT_RATE_LIMITS.ip.refillPerSecond);
    const userCapacity = numericEnv(process.env.RATE_LIMIT_USER_CAPACITY, DEFAULT_RATE_LIMITS.user.capacity);
    const userRate = numericEnv(process.env.RATE_LIMIT_USER_REFILL, DEFAULT_RATE_LIMITS.user.refillPerSecond);

    this.ipLimiter = new TokenBucketLimiter({ capacity: ipCapacity, refillPerSecond: ipRate });
    this.userLimiter = new TokenBucketLimiter({ capacity: userCapacity, refillPerSecond: userRate });
    this.enabled = isRateLimitEnabled();
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.enabled) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: { id?: string } }>();
    const now = Date.now();

    const ip = request.ip || request.socket?.remoteAddress || 'unknown';
    const ipDecision = this.ipLimiter.check(`ip:${ip}`, now);
    if (!ipDecision.allowed) {
      throw this.tooManyRequests(ipDecision.retryAfterSeconds);
    }

    const userId = request.user?.id;
    if (userId) {
      const userDecision = this.userLimiter.check(`user:${userId}`, now);
      if (!userDecision.allowed) {
        throw this.tooManyRequests(userDecision.retryAfterSeconds);
      }
    }

    const headers = rateLimitHeaders(ipDecision);
    for (const [name, value] of Object.entries(headers)) {
      request.raw?.res?.setHeader?.(name, value);
    }
    return true;
  }

  private tooManyRequests(retryAfterSeconds: number): HttpException {
    return new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Retry in ${retryAfterSeconds} second(s).`,
        retryAfter: retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
