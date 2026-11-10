import io

p = r"B:\B\tax-app\apps\api\src\modules\auth\auth.service.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

# imports
s = s.replace(
    "} from './email-verification';",
    "} from './email-verification';\n"
    "import {\n"
    "  generateRecoveryCode,\n"
    "  hashRecoveryCode,\n"
    "  normaliseRecoveryCode,\n"
    "  generateTotpSecret,\n"
    "  otpauthUrl,\n"
    "  verifyTotp,\n"
    "} from './totp';\n"
    "import { openSecret, sealSecret } from './secret-box';",
)

# login signature + MFA challenge
s = s.replace(
    """  async login(
    dto: LoginRequestDto,
    meta?: { ipAddress?: string; userAgent?: string }
  ): Promise<AuthResponseDto> {""",
    """  async login(
    dto: LoginRequestDto,
    meta?: { ipAddress?: string; userAgent?: string },
    totpCode?: string,
  ): Promise<AuthResponseDto> {""",
)

s = s.replace(
    """    const isPasswordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }""",
    """    const isPasswordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Second factor, when enrolled. The password alone is not enough; the client
    // recognises the MFA_REQUIRED message and asks for the six-digit code.
    if (user.mfaEnabled) {
      const accepted = await this.verifySecondFactor(user.id, user.mfaSecret, totpCode, receivedCodes);
      if (!accepted) {
        throw new UnauthorizedException(
          totpCode ? 'Invalid authentication code' : 'MFA_REQUIRED',
        );
      }
    }""",
)

# The recovery-code list must be read before use.
s = s.replace(
    """    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { profile: true },
    });""",
    """    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { profile: true },
    });
    const receivedCodes = user?.mfaRecoveryCodes ?? [];""",
)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("login patched")
