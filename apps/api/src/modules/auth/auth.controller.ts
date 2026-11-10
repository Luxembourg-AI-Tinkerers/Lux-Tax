import {
  Controller,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
} from '@luxtax/validation';
import {
  RegisterRequestDto,
  LoginRequestDto,
  RefreshTokenRequestDto,
  AuthResponseDto,
} from '@luxtax/contracts';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() body: RegisterRequestDto, @Req() req: any): Promise<AuthResponseDto> {
    const parseResult = registerSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.errors[0]?.message || 'Validation failed');
    }
    return this.authService.register(parseResult.data, {
      // L6: the adapter decides whether the header is trusted; never read it here.
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
    });
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginRequestDto, @Req() req: any): Promise<AuthResponseDto> {
    const parseResult = loginSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.errors[0]?.message || 'Validation failed');
    }
    const totpCode =
      typeof (body as unknown as { totpCode?: unknown })?.totpCode === 'string'
        ? (body as unknown as { totpCode: string }).totpCode
        : undefined;
    return this.authService.login(
      parseResult.data,
      {
        // L6: `req.ip` is the socket address unless the adapter was built with
        // `trustProxy` (main.ts), in which case Fastify has already resolved
        // the header against the configured hops/networks. Reading
        // `x-forwarded-for` here as well would bypass that decision and let any
        // caller write an arbitrary address into the audit trail.
        ipAddress: req.ip,
        userAgent: req.headers?.['user-agent'],
      },
      totpCode,
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() body: RefreshTokenRequestDto,
    @Req() req: any,
  ): Promise<AuthResponseDto> {
    const parseResult = refreshTokenSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.errors[0]?.message || 'Validation failed');
    }
    return this.authService.refresh(parseResult.data, {
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
    });
  }

  /**
   * Confirm an address from the link in the verification e-mail. Public on
   * purpose: the token is the credential.
   */
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() body: { token?: unknown }): Promise<{ verified: true }> {
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    if (token.length < 16) {
      throw new BadRequestException('A verification token is required');
    }
    return this.authService.verifyEmail(token);
  }

  /** Re-send the link for the signed-in, unverified account. */
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async resendVerification(@CurrentUser('id') userId: string): Promise<{ sent: boolean }> {
    return this.authService.resendVerification(userId);
  }

  /**
   * Multi-factor authentication. Enrolment returns the seed once; activation
   * requires a code, and disabling requires a code or a recovery code.
   */
  @Post('mfa/enrol')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async enrolMfa(@CurrentUser('id') userId: string) {
    return this.authService.enrolMfa(userId);
  }

  @Post('mfa/activate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async activateMfa(@CurrentUser('id') userId: string, @Body() body: { code?: unknown }) {
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    if (!code) throw new BadRequestException('A code is required');
    return this.authService.activateMfa(userId, code);
  }

  @Post('mfa/disable')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async disableMfa(@CurrentUser('id') userId: string, @Body() body: { code?: unknown }) {
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    if (!code) throw new BadRequestException('A code is required');
    return this.authService.disableMfa(userId, code);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUser('id') userId: string,
    @Body() body: { refreshToken?: string }
  ): Promise<void> {
    await this.authService.logout(userId, body.refreshToken);
  }
}
