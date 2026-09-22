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
      ipAddress: req.ip || req.headers?.['x-forwarded-for'],
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
    return this.authService.login(parseResult.data, {
      ipAddress: req.ip || req.headers?.['x-forwarded-for'],
      userAgent: req.headers?.['user-agent'],
    });
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: RefreshTokenRequestDto): Promise<AuthResponseDto> {
    const parseResult = refreshTokenSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.errors[0]?.message || 'Validation failed');
    }
    return this.authService.refresh(parseResult.data);
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
