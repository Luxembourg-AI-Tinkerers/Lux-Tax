import io

p = r"B:\B\tax-app\apps\api\src\modules\auth\auth.service.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

# 1. imports
s = s.replace(
    "import { jwtAccessSecret } from '../../config/runtime-config';",
    "import { jwtAccessSecret } from '../../config/runtime-config';\n"
    "import {\n"
    "  issueVerificationToken,\n"
    "  hashCode as hashVerificationToken,\n"
    "  sendVerificationEmail,\n"
    "} from './email-verification';",
)

# 2. token payload carries the revocation counter
s = s.replace(
    "  private async generateTokens(userId: string, email: string) {\n    const payload = { sub: userId, email };",
    "  private async generateTokens(\n"
    "    userId: string,\n"
    "    email: string,\n"
    "    tokenVersion = 0,\n"
    "    familyId?: string,\n"
    "  ) {\n"
    "    const payload = { sub: userId, email, tv: tokenVersion };",
)

# 3. same family across a rotation, new family on a fresh login
s = s.replace(
    "    await this.prisma.session.create({\n      data: {\n        userId,\n        refreshTokenHash,\n        expiresAt,\n      },\n    });",
    "    const family = familyId ?? crypto.randomBytes(16).toString('hex');\n"
    "    await this.prisma.session.create({\n"
    "      data: {\n"
    "        userId,\n"
    "        refreshTokenHash,\n"
    "        expiresAt,\n"
    "        familyId: family,\n"
    "      },\n"
    "    });",
)

# 4. registration issues the verification mail
s = s.replace(
    "    const tokens = await this.generateTokens(user.id, user.email);\n\n    return {\n      user: {\n        id: user.id,\n        email: user.email,\n        firstName: user.profile?.firstName || undefined,\n        lastName: user.profile?.lastName || undefined,\n        isEmailVerified: user.isEmailVerified,\n        createdAt: user.createdAt.toISOString(),\n      },\n      tokens,\n    };\n  }\n\n  async login(",
    "    await this.issueVerification(user.id, user.email);\n\n"
    "    const tokens = await this.generateTokens(user.id, user.email);\n\n"
    "    return {\n"
    "      user: {\n"
    "        id: user.id,\n"
    "        email: user.email,\n"
    "        firstName: user.profile?.firstName || undefined,\n"
    "        lastName: user.profile?.lastName || undefined,\n"
    "        isEmailVerified: user.isEmailVerified,\n"
    "        createdAt: user.createdAt.toISOString(),\n"
    "      },\n"
    "      tokens,\n"
    "    };\n"
    "  }\n\n"
    "  /** Mint a one-time token, store its hash, and send the link. */\n"
    "  private async issueVerification(userId: string, email: string): Promise<void> {\n"
    "    const issued = issueVerificationToken();\n"
    "    await this.prisma.user.update({\n"
    "      where: { id: userId },\n"
    "      data: {\n"
    "        emailVerificationTokenHash: issued.hash,\n"
    "        emailVerificationExpiresAt: issued.expiresAt,\n"
    "      },\n"
    "    });\n"
    "    await sendVerificationEmail(email, issued.token);\n"
    "  }\n\n"
    "  /** Confirm an address. Single use: the token is cleared on success. */\n"
    "  async verifyEmail(rawToken: string): Promise<{ verified: true }> {\n"
    "    const hash = hashVerificationToken(rawToken.trim());\n"
    "    const user = await this.prisma.user.findUnique({\n"
    "      where: { emailVerificationTokenHash: hash },\n"
    "      select: { id: true, emailVerificationExpiresAt: true, isEmailVerified: true },\n"
    "    });\n\n"
    "    if (!user) {\n"
    "      throw new BadRequestException('This verification link is not valid');\n"
    "    }\n"
    "    if (user.isEmailVerified) {\n"
    "      throw new BadRequestException('This account is already verified');\n"
    "    }\n"
    "    if (!user.emailVerificationExpiresAt || user.emailVerificationExpiresAt < new Date()) {\n"
    "      throw new BadRequestException('This verification link has expired');\n"
    "    }\n\n"
    "    await this.prisma.user.update({\n"
    "      where: { id: user.id },\n"
    "      data: {\n"
    "        isEmailVerified: true,\n"
    "        emailVerificationTokenHash: null,\n"
    "        emailVerificationExpiresAt: null,\n"
    "      },\n"
    "    });\n\n"
    "    await this.auditService.log({\n"
    "      actorId: user.id,\n"
    "      eventType: AuditEventType.USER_REGISTERED,\n"
    "      entityType: 'User',\n"
    "      entityId: user.id,\n"
    "      description: 'E-mail address verified',\n"
    "    });\n\n"
    "    return { verified: true };\n"
    "  }\n\n"
    "  /** Re-send the link; rate limiting is the caller's responsibility. */\n"
    "  async resendVerification(userId: string): Promise<{ sent: boolean }> {\n"
    "    const user = await this.prisma.user.findUnique({\n"
    "      where: { id: userId },\n"
    "      select: { id: true, email: true, isEmailVerified: true },\n"
    "    });\n"
    "    if (!user) throw new UnauthorizedException('Account not found');\n"
    "    if (user.isEmailVerified) throw new BadRequestException('This account is already verified');\n"
    "    await this.issueVerification(user.id, user.email);\n"
    "    return { sent: true };\n"
    "  }\n\n"
    "  async login(",
)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("register/verify ok")
