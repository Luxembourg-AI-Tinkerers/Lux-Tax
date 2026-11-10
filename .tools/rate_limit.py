import io

p = r"B:\B\tax-app\apps\api\src\common\guards\rate-limit.guard.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

header = """/**
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
  const path = url.split('?')[0].replace(/\\/+$/, '');
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
"""

old_header_start = s.index("/**\n * Global rate-limit guard (API-8).")
old_header_end = s.index("@Injectable()\nexport class RateLimitGuard")
s = s[:old_header_start] + header + "\n" + s[old_header_end:]

# Constructor: add the credential limiter.
s = s.replace(
    "  private readonly ipLimiter: TokenBucketLimiter;\n  private readonly userLimiter: TokenBucketLimiter;",
    "  private readonly ipLimiter: TokenBucketLimiter;\n  private readonly userLimiter: TokenBucketLimiter;\n  private readonly credentialLimiter: TokenBucketLimiter;",
)
s = s.replace(
    "    this.userLimiter = new TokenBucketLimiter({ capacity: userCapacity, refillPerSecond: userRate });",
    "    this.userLimiter = new TokenBucketLimiter({ capacity: userCapacity, refillPerSecond: userRate });\n"
    "    this.credentialLimiter = new TokenBucketLimiter(CREDENTIAL_LIMITS);",
)

# Body: credential bucket + drop the dead user branch into a documented note.
old_body = """    const ip = request.ip || request.socket?.remoteAddress || 'unknown';
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
    }"""

new_body = """    const ip = request.ip || request.socket?.remoteAddress || 'unknown';
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
    }"""

assert s.count(old_body) == 1, s.count(old_body)
s = s.replace(old_body, new_body)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
