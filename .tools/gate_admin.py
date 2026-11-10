import io

p = r"B:\B\tax-app\apps\api\src\common\guards\platform-admin.guard.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

old = """  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const email = request?.user?.email;
    const allowlist = parseAdminEmails(process.env.ADMIN_EMAILS);

    if (typeof email !== 'string' || !isPlatformAdminEmail(email, allowlist)) {
      throw new ForbiddenException('Platform administrator access required');
    }
    return true;
  }"""

new = """  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const email = request?.user?.email;
    const verified = request?.user?.isEmailVerified === true;
    const allowlist = parseAdminEmails(process.env.ADMIN_EMAILS);

    // The allowlist matches on an e-mail address, so it is only as strong as the
    // proof that the account controls that address. Without this check, whoever
    // registers an allowlisted address first becomes the platform administrator
    // — no mailbox required.
    if (!verified) {
      throw new ForbiddenException(
        'Platform administrator access requires a verified e-mail address',
      );
    }

    if (typeof email !== 'string' || !isPlatformAdminEmail(email, allowlist)) {
      throw new ForbiddenException('Platform administrator access required');
    }
    return true;
  }"""
assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))

# jwt.strategy: expose isEmailVerified (already) + compare tokenVersion
p = r"B:\B\tax-app\apps\api\src\modules\auth\jwt.strategy.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

s = s.replace(
    "export interface JwtPayload {\n  sub: string;\n  email: string;\n}",
    "export interface JwtPayload {\n  sub: string;\n  email: string;\n  /** Revocation counter; a mismatch with the database means the token is dead. */\n  tv?: number;\n}",
)
s = s.replace(
    "        isActive: true,\n        isEmailVerified: true,",
    "        isActive: true,\n        isEmailVerified: true,\n        tokenVersion: true,",
)
s = s.replace(
    "    if (!user || !user.isActive) {\n      throw new UnauthorizedException('User is inactive or not found');\n    }",
    "    if (!user || !user.isActive) {\n      throw new UnauthorizedException('User is inactive or not found');\n    }\n\n"
    "    // A logout bumps the counter, which invalidates every access token already\n"
    "    // issued — otherwise a \"signed out\" token keeps working for up to 15 min.\n"
    "    const presented = typeof payload.tv === 'number' ? payload.tv : 0;\n"
    "    if (presented !== user.tokenVersion) {\n"
    "      throw new UnauthorizedException('Session has been revoked');\n"
    "    }",
)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
