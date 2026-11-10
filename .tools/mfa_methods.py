import io

p = r"B:\B\tax-app\apps\api\src\modules\auth\auth.service.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

anchor = "  async register("
methods = '''  /**
   * Start enrolment. The seed is returned once (for the QR code) and stored
   * sealed; `mfaEnabled` stays false until a code proves the authenticator works.
   */
  async enrolMfa(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, mfaEnabled: true },
    });
    if (!user) throw new UnauthorizedException('Account not found');
    if (user.mfaEnabled) {
      throw new BadRequestException('Multi-factor authentication is already enabled');
    }

    const secret = generateTotpSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: sealSecret(secret) },
    });

    return { secret, otpauthUrl: otpauthUrl({ secret, account: user.email }) };
  }

  /** Confirm enrolment with one code; returns the recovery codes exactly once. */
  async activateMfa(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mfaSecret: true, mfaEnabled: true },
    });
    if (!user?.mfaSecret) {
      throw new BadRequestException('Start enrolment before activating');
    }
    if (user.mfaEnabled) {
      throw new BadRequestException('Multi-factor authentication is already enabled');
    }
    if (!verifyTotp(openSecret(user.mfaSecret), code, Date.now())) {
      throw new BadRequestException('That code is not valid');
    }

    const recoveryCodes = Array.from({ length: 10 }, () => generateRecoveryCode());
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaRecoveryCodes: recoveryCodes.map(hashRecoveryCode),
      },
    });

    await this.auditService.log({
      actorId: userId,
      eventType: AuditEventType.USER_LOGGED_IN,
      entityType: 'User',
      entityId: userId,
      description: 'Multi-factor authentication enabled',
    });

    return { recoveryCodes };
  }

  /** Turn it off — requires a current code or a recovery code. */
  async disableMfa(userId: string, code: string): Promise<{ disabled: true }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mfaSecret: true, mfaEnabled: true, mfaRecoveryCodes: true },
    });
    if (!user?.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException('Multi-factor authentication is not enabled');
    }

    const accepted = await this.verifySecondFactor(
      userId,
      user.mfaSecret,
      code,
      user.mfaRecoveryCodes,
    );
    if (!accepted) throw new BadRequestException('That code is not valid');

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null, mfaRecoveryCodes: [] },
    });
    return { disabled: true };
  }

  /**
   * Accept either a TOTP code or an unused recovery code. A recovery code is
   * consumed on use, so it cannot be replayed.
   */
  private async verifySecondFactor(
    userId: string,
    sealedSecret: string | null,
    code: string | undefined,
    recoveryCodes: readonly string[],
  ): Promise<boolean> {
    if (!code) return false;
    const candidate = code.replace(/\\s/g, '');

    if (sealedSecret && /^\\d{6}$/.test(candidate)) {
      try {
        if (verifyTotp(openSecret(sealedSecret), candidate, Date.now())) return true;
      } catch {
        // A corrupt seal must not authenticate anybody; fall through to recovery.
      }
    }

    const hashed = hashRecoveryCode(normaliseRecoveryCode(code));
    if (!recoveryCodes.includes(hashed)) return false;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaRecoveryCodes: recoveryCodes.filter((entry) => entry !== hashed),
      },
    });
    return true;
  }

  async register('''

assert s.count(anchor) == 1
s = s.replace(anchor, methods)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("mfa methods ok")
