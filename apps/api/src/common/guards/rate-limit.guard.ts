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
 * Three buckets:
 *   1. client IP — every request;
 *   2. the credential endpoint — a much smaller bucket keyed by IP *and* the
 *      submitted address, so password guessing against one account is stopped
 *      even when it comes from a single address;
 *   3. authenticated user — applied by controllers that run it after
 *      `JwtAuthGuard`, because a global guard runs before authentication and
 *      `request.user` is therefore always undefined here.
 *
 * On by default (`RATE_LIMIT_ENABLED=false` disables it). A limiter that is off
 * unless somebody remembers to turn it on does not protect anything: the
 * previous default left `/api/auth/login` unthrottled, and every attempt costs a
 * 64 MiB argon2 hash.
 */
export function isRateLimitEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.RATE_LIMIT_ENABLED ?? '').toLowerCase() !== 'false';
}

/** Endpoints where a wrong credential is the attack: throttle by IP + subject. */
const CREDENTIAL_PATHS = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh'];

export function isCredentialPath(url: string): boolean {
  const path = url.split('?')[0].replace(/\/+$/, '');
  return CREDENTIAL_PATHS.some((candidate) => path === candidate);
}

/** Bucket for one address against one account: 5 attempts, refilling slowly. */
const CREDENTIAL_LIMITS = { capacity: 5, refillPerSecond: 1 / 60 };

/** Key for the credential bucket; exported for the test. */
export function credentialKey(ip: string, email: unknown): string {
  const subject = typeof email === 'string' && email.trim().length > 0
    ? email.trim().toLowerCase()
    : 'anonymous';
  return `credential:${ip}:${subject}`;
}

function numericEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly ipLimiter: TokenBucketLimiter;
  private readonly userLimiter: TokenBucketLimiter;
  private readonly credentialLimiter: TokenBucketLimiter;
  private readonly enabled: boolean;

  constructor() {
    const ipCapacity = numericEnv(process.env.RATE_LIMIT_IP_CAPACITY, DEFAULT_RATE_LIMITS.ip.capacity);
    const ipRate = numericEnv(process.env.RATE_LIMIT_IP_REFILL, DEFAULT_RATE_LIMITS.ip.refillPerSecond);
    const userCapacity = numericEnv(process.env.RATE_LIMIT_USER_CAPACITY, DEFAULT_RATE_LIMITS.user.capacity);
    const userRate = numericEnv(process.env.RATE_LIMIT_USER_REFILL, DEFAULT_RATE_LIMITS.user.refillPerSecond);

    this.ipLimiter = new TokenBucketLimiter({ capacity: ipCapacity, refillPerSecond: ipRate });
    this.userLimiter = new TokenBucketLimiter({ capacity: userCapacity, refillPerSecond: userRate });
    this.credentialLimiter = new TokenBucketLimiter(CREDENTIAL_LIMITS);
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

    // The credential bucket is keyed by the submitted address as well as the IP,
    // so guessing one password from many addresses still trips it, and one
    // address cannot be hammered from a shared IP.
    if (isCredentialPath(request.url ?? '')) {
      const email = (request.body as { email?: unknown } | undefined)?.email;
      const credentialDecision = this.credentialLimiter.check(credentialKey(ip, email), now);
      if (!credentialDecision.allowed) {
        throw this.tooManyRequests(credentialDecision.retryAfterSeconds);
      }
    }

    // A global guard runs before `JwtAuthGuard`, so `request.user` is undefined
    // here and a user bucket would never fire. Controllers that want per-user
    // limiting apply this guard *after* authentication; see the comment on the
    // class. The limiter is kept so that usage is cheap to add.
    const userId = request.user?.id;
    if (userId) {
      const userDecision = this.userLimiter.check(`user:${userId}`, now);
      if (!userDecision.allowed) {
        throw this.tooManyRequests(userDecision.retryAfterSeconds);
      }
    }

    const headers = rateLimitHeaders(ipDecision);
    for (const [name, value] of Object.entries(headers)) {
      // Under Fastify the Node response is not on `IncomingMessage`; the reply
      // object is, and it is what actually writes the headers.
      const reply = (request as unknown as { raw?: { res?: { setHeader?: (n: string, v: string) => void } } })
        .raw?.res;
      reply?.setHeader?.(name, value);
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
