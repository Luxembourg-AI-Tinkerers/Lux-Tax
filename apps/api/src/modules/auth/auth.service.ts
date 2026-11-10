import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { jwtAccessSecret } from '../../config/runtime-config';
import {
  issueVerificationToken,
  hashCode as hashVerificationToken,
  sendVerificationEmail,
} from './email-verification';
import {
  generateRecoveryCode,
  hashRecoveryCode,
  normaliseRecoveryCode,
  generateTotpSecret,
  otpauthUrl,
  verifyTotp,
} from './totp';
import { openSecret, sealSecret } from './secret-box';
import {
  RegisterRequestDto,
  LoginRequestDto,
  RefreshTokenRequestDto,
  AuthResponseDto,
  AuditEventType,
} from '@luxtax/contracts';

/**
 * Argon2id hash of a value nobody knows, used to spend the same work when the
 * account is missing. Computed once, lazily, with the same parameters as a real
 * password so the timing of a failed login does not depend on whether the
 * address exists.
 */
/**
 * Codes already accepted, per user, so a code cannot be replayed inside its
 * ±1-step window. In-process only: a multi-replica deployment needs this in a
 * shared store, which is the same caveat the rate limiter carries.
 */
const usedTotpCodes = new Map<string, number>();
const TOTP_REPLAY_WINDOW_MS = 90_000;

function claimTotpCode(userId: string, code: string, now = Date.now()): boolean {
  for (const [key, seenAt] of usedTotpCodes) {
    if (now - seenAt > TOTP_REPLAY_WINDOW_MS) usedTotpCodes.delete(key);
  }
  const key = `${userId}:${code}`;
  if (usedTotpCodes.has(key)) return false;
  usedTotpCodes.set(key, now);
  return true;
}

let dummyPasswordHash: string | null = null;

async function getDummyPasswordHash(): Promise<string> {
  if (!dummyPasswordHash) {
    dummyPasswordHash = await argon2.hash('luxtax-dummy-password', {
      type: argon2.argon2id,
      memoryCost: 2 ** 16,
      timeCost: 3,
    });
  }
  return dummyPasswordHash;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService
  ) {}

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async generateTokens(
    userId: string,
    email: string,
    tokenVersion = 0,
    familyId?: string,
    meta?: { ipAddress?: string; userAgent?: string },
  ) {
    const payload = { sub: userId, email, tv: tokenVersion };
    const accessToken = this.jwtService.sign(payload, {
      secret: jwtAccessSecret(),
      expiresIn: '15m',
    });

    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const refreshTokenHash = this.hashToken(rawRefreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    const family = familyId ?? crypto.randomBytes(16).toString('hex');

    // M10: the session list is the only place a user can see where they are
    // signed in. The columns existed but were never written, so there was
    // nothing to show and nothing to investigate after a compromise.
    await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash,
        expiresAt,
        familyId: family,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      },
    });

    // Keep the table from growing without bound: an expired session can no
    // longer authenticate anything, so it is deleted as the next one is issued.
    await this.prisma.session.deleteMany({
      where: { userId, expiresAt: { lt: new Date() } },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: 900, // 15 minutes in seconds
    };
  }

  /**
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
    const candidate = code.replace(/\s/g, '');

    if (sealedSecret && /^\d{6}$/.test(candidate)) {
      try {
        if (
          verifyTotp(openSecret(sealedSecret), candidate, Date.now()) &&
          claimTotpCode(userId, candidate)
        ) {
          return true;
        }
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

  async register(
    dto: RegisterRequestDto,
    meta?: { ipAddress?: string; userAgent?: string }
  ): Promise<AuthResponseDto> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16, // 64 MB
      timeCost: 3,
    });

    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        profile: {
          create: {
            firstName: dto.firstName?.trim(),
            lastName: dto.lastName?.trim(),
          },
        },
      },
      include: {
        profile: true,
      },
    });

    await this.auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      eventType: AuditEventType.USER_REGISTERED,
      entityType: 'User',
      entityId: user.id,
      description: `User ${user.email} registered successfully`,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    await this.issueVerification(user.id, user.email);

    const tokens = await this.generateTokens(user.id, user.email, 0, undefined, meta);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.profile?.firstName || undefined,
        lastName: user.profile?.lastName || undefined,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt.toISOString(),
      },
      tokens,
    };
  }

  /** Mint a one-time token, store its hash, and send the link. */
  private async issueVerification(userId: string, email: string): Promise<void> {
    const issued = issueVerificationToken();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerificationTokenHash: issued.hash,
        emailVerificationExpiresAt: issued.expiresAt,
      },
    });
    await sendVerificationEmail(email, issued.token);
  }

  /** Confirm an address. Single use: the token is cleared on success. */
  async verifyEmail(rawToken: string): Promise<{ verified: true }> {
    const hash = hashVerificationToken(rawToken.trim());
    const user = await this.prisma.user.findUnique({
      where: { emailVerificationTokenHash: hash },
      select: { id: true, emailVerificationExpiresAt: true, isEmailVerified: true },
    });

    if (!user) {
      throw new BadRequestException('This verification link is not valid');
    }
    if (user.isEmailVerified) {
      throw new BadRequestException('This account is already verified');
    }
    if (!user.emailVerificationExpiresAt || user.emailVerificationExpiresAt < new Date()) {
      throw new BadRequestException('This verification link has expired');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
      },
    });

    await this.auditService.log({
      actorId: user.id,
      eventType: AuditEventType.USER_REGISTERED,
      entityType: 'User',
      entityId: user.id,
      description: 'E-mail address verified',
    });

    return { verified: true };
  }

  /** Re-send the link; rate limiting is the caller's responsibility. */
  async resendVerification(userId: string): Promise<{ sent: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, isEmailVerified: true },
    });
    if (!user) throw new UnauthorizedException('Account not found');
    if (user.isEmailVerified) throw new BadRequestException('This account is already verified');
    await this.issueVerification(user.id, user.email);
    return { sent: true };
  }

  private readonly logger = new Logger(AuthService.name);

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

  async login(
    dto: LoginRequestDto,
    meta?: { ipAddress?: string; userAgent?: string },
    totpCode?: string,
  ): Promise<AuthResponseDto> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { profile: true },
    });
    const receivedCodes = user?.mfaRecoveryCodes ?? [];

    // Always perform a verify, even when the account does not exist, so the
    // response time does not reveal whether an address is registered. The dummy
    // hash is a real argon2id hash of a random value, produced once.
    if (!user || !user.isActive) {
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

    const isPasswordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!isPasswordValid) {
      await this.recordLoginFailure(normalizedEmail, 'WRONG_PASSWORD', user.id, meta);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Second factor, when enrolled. The password alone is not enough; the client
    // recognises the MFA_REQUIRED message and asks for the six-digit code.
    if (user.mfaEnabled) {
      const accepted = await this.verifySecondFactor(user.id, user.mfaSecret, totpCode, receivedCodes);
      if (!accepted) {
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
    }

    await this.auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      eventType: AuditEventType.USER_LOGGED_IN,
      entityType: 'User',
      entityId: user.id,
      description: `User ${user.email} logged in`,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.tokenVersion,
      undefined,
      meta,
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.profile?.firstName || undefined,
        lastName: user.profile?.lastName || undefined,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt.toISOString(),
      },
      tokens,
    };
  }

  async refresh(
    dto: RefreshTokenRequestDto,
    meta?: { ipAddress?: string; userAgent?: string },
  ): Promise<AuthResponseDto> {
    const tokenHash = this.hashToken(dto.refreshToken);

    // Look the token up even when it is revoked: a token presented after its
    // rotation is a replay, and the correct response is to burn the whole family
    // rather than merely rejecting that one request.
    const session = await this.prisma.session.findFirst({
      where: { refreshTokenHash: tokenHash },
      include: {
        user: {
          include: { profile: true },
        },
      },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (session.revokedAt) {
      if (session.familyId) {
        await this.prisma.session.updateMany({
          where: { familyId: session.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await this.auditService.log({
        actorId: session.userId,
        eventType: AuditEventType.USER_LOGGED_OUT,
        entityType: 'Session',
        entityId: session.id,
        description: 'Refresh token replayed after rotation; token family revoked',
      });
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!session.user || !session.user.isActive || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Revoke old session (refresh token rotation), staying in the same family.
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.generateTokens(
      session.user.id,
      session.user.email,
      session.user.tokenVersion,
      session.familyId ?? undefined,
      meta,
    );

    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        firstName: session.user.profile?.firstName || undefined,
        lastName: session.user.profile?.lastName || undefined,
        isEmailVerified: session.user.isEmailVerified,
        createdAt: session.user.createdAt.toISOString(),
      },
      tokens,
    };
  }

  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      const tokenHash = this.hashToken(refreshToken);
      await this.prisma.session.updateMany({
        where: { userId, refreshTokenHash: tokenHash },
        data: { revokedAt: new Date() },
      });
    } else {
      // Revoke all active sessions
      await this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    // Access tokens are stateless, so the only way to honour a logout immediately
    // is to move the counter they are checked against.
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });

    await this.auditService.log({
      actorId: userId,
      eventType: AuditEventType.USER_LOGGED_OUT,
      entityType: 'User',
      entityId: userId,
      description: 'User logged out',
    });
  }
}
