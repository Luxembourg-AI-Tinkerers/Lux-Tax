import io

p = r"B:\B\tax-app\apps\api\src\modules\auth\auth.service.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
t = raw.replace("\r\n", "\n")

# 1. Import Logger so a failed audit write is visible without failing the login.
old_import = "import {\n  Injectable,\n  ConflictException,\n  UnauthorizedException,\n  BadRequestException,\n} from '@nestjs/common';\n"
new_import = "import {\n  Injectable,\n  ConflictException,\n  UnauthorizedException,\n  BadRequestException,\n  Logger,\n} from '@nestjs/common';\n"
assert t.count(old_import) == 1, "nestjs import"
t = t.replace(old_import, new_import, 1)

# 2. The helper, placed right before login().
helper = '''  private readonly logger = new Logger(AuthService.name);

  /**
   * L3: a rejected login is an audit event.
   *
   * Without it the only trace of a wrong password is a 401 in a log line, so a
   * slow credential-stuffing run against many addresses leaves nothing to
   * investigate. Three properties matter:
   *
   * - it records every refusal, including an address that matches no account
   *   (`actorId` null), because enumerating addresses is itself the attack;
   * - it never records the submitted password, nor any hash of it;
   * - it never turns a 401 into a 500: an audit failure is logged and the caller
   *   still gets its refusal.
   */
  private async recordLoginFailure(
    email: string,
    reason: 'UNKNOWN_ACCOUNT' | 'INACTIVE_ACCOUNT' | 'WRONG_PASSWORD' | 'INVALID_SECOND_FACTOR',
    userId: string | null,
    meta?: { ipAddress?: string; userAgent?: string },
  ): Promise<void> {
    try {
      await this.auditService.log({
        actorId: userId ?? undefined,
        actorEmail: email,
        eventType: AuditEventType.USER_LOGIN_FAILED,
        entityType: 'User',
        entityId: userId ?? email,
        newValue: { reason, attemptedEmail: email },
        description:
          reason === 'UNKNOWN_ACCOUNT'
            ? `Rejected login for an address with no account (${email})`
            : `Rejected login for ${email}: ${reason.toLowerCase().replace(/_/g, ' ')}`,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      });
    } catch (error) {
      // The refusal is the security behaviour; the audit row is the record of it.
      // A failure to write must not change the answer the caller receives.
      this.logger.error(
        `Could not record a rejected login for ${email}: ${(error as Error).message}`,
      );
    }
  }

'''
anchor = "  async login(\n"
assert t.count(anchor) == 1, "login anchor"
t = t.replace(anchor, helper + anchor, 1)

# 3. Branch: unknown or inactive account.
old_branch = """    if (!user || !user.isActive) {
      await argon2.verify(await getDummyPasswordHash(), dto.password).catch(() => false);
      throw new UnauthorizedException('Invalid email or password');
    }
"""
new_branch = """    if (!user || !user.isActive) {
      await argon2.verify(await getDummyPasswordHash(), dto.password).catch(() => false);
      // A disabled account and an unknown address answer identically; the audit
      // row still distinguishes them for an investigator.
      await this.recordLoginFailure(
        normalizedEmail,
        user ? 'INACTIVE_ACCOUNT' : 'UNKNOWN_ACCOUNT',
        user?.id ?? null,
        meta,
      );
      throw new UnauthorizedException('Invalid email or password');
    }
"""
assert t.count(old_branch) == 1, "unknown account branch"
t = t.replace(old_branch, new_branch, 1)

# 4. Branch: wrong password.
old_pw = """    const isPasswordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }
"""
new_pw = """    const isPasswordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!isPasswordValid) {
      await this.recordLoginFailure(normalizedEmail, 'WRONG_PASSWORD', user.id, meta);
      throw new UnauthorizedException('Invalid email or password');
    }
"""
assert t.count(old_pw) == 1, "wrong password branch"
t = t.replace(old_pw, new_pw, 1)

# 5. Branch: failed second factor.
old_mfa = """      if (!accepted) {
        throw new UnauthorizedException(
          totpCode ? 'Invalid authentication code' : 'MFA_REQUIRED',
        );
      }
"""
new_mfa = """      if (!accepted) {
        // A missing code is not a failure to record: the client is being asked
        // for the second factor, which is the normal path. A *presented* code
        // that does not verify is a failed attempt and is recorded.
        if (totpCode) {
          await this.recordLoginFailure(normalizedEmail, 'INVALID_SECOND_FACTOR', user.id, meta);
        }
        throw new UnauthorizedException(
          totpCode ? 'Invalid authentication code' : 'MFA_REQUIRED',
        );
      }
"""
assert t.count(old_mfa) == 1, "mfa branch"
t = t.replace(old_mfa, new_mfa, 1)

io.open(p, "w", encoding="utf-8", newline=nl).write(t)
print("auth.service.ts: failed-login audit wired")
