import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { jwtAccessSecret } from '../../config/runtime-config';

export interface JwtPayload {
  sub: string;
  email: string;
  /** Revocation counter; a mismatch with the database means the token is dead. */
  tv?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtAccessSecret(),
      // Pin the algorithm: with a symmetric secret this is defence in depth, and
      // it is what stops a future PEM migration from enabling key confusion.
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        isActive: true,
        isEmailVerified: true,
        tokenVersion: true,
        profile: {
          select: {
            firstName: true,
            lastName: true,
            taxResidence: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User is inactive or not found');
    }

    // A logout bumps the counter, which invalidates every access token already
    // issued — otherwise a "signed out" token keeps working for up to 15 min.
    const presented = typeof payload.tv === 'number' ? payload.tv : 0;
    if (presented !== user.tokenVersion) {
      throw new UnauthorizedException('Session has been revoked');
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.profile?.firstName,
      lastName: user.profile?.lastName,
      isEmailVerified: user.isEmailVerified,
    };
  }
}
