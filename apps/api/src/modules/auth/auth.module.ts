import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { AuditModule } from '../audit/audit.module';
import { assertRuntimeConfig, jwtAccessSecret } from '../../config/runtime-config';

// Fail fast: a missing or defaulted signing key must stop the process, not
// produce tokens that anybody who has read this repository can forge.
assertRuntimeConfig();

@Global()
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: jwtAccessSecret(),
      signOptions: { expiresIn: '15m' },
    }),
    AuditModule,
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}
