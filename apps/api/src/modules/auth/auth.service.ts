import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  RegisterRequestDto,
  LoginRequestDto,
  RefreshTokenRequestDto,
  AuthResponseDto,
  AuditEventType,
} from '@luxtax/contracts';

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

  private async generateTokens(userId: string, email: string) {
    const payload = { sub: userId, email };
    const accessToken = this.jwtService.sign(payload, {
      secret:
        process.env.JWT_ACCESS_SECRET || 'dev_luxembourg_tax_jwt_access_secret_32chars_min_2026',
      expiresIn: '15m',
    });

    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const refreshTokenHash = this.hashToken(rawRefreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: 900, // 15 minutes in seconds
    };
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

    const tokens = await this.generateTokens(user.id, user.email);

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

  async login(
    dto: LoginRequestDto,
    meta?: { ipAddress?: string; userAgent?: string }
  ): Promise<AuthResponseDto> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { profile: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
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

    const tokens = await this.generateTokens(user.id, user.email);

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

  async refresh(dto: RefreshTokenRequestDto): Promise<AuthResponseDto> {
    const tokenHash = this.hashToken(dto.refreshToken);

    const session = await this.prisma.session.findFirst({
      where: {
        refreshTokenHash: tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: {
          include: { profile: true },
        },
      },
    });

    if (!session || !session.user || !session.user.isActive) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Revoke old session (refresh token rotation)
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.generateTokens(session.user.id, session.user.email);

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

    await this.auditService.log({
      actorId: userId,
      eventType: AuditEventType.USER_LOGGED_OUT,
      entityType: 'User',
      entityId: userId,
      description: 'User logged out',
    });
  }
}
