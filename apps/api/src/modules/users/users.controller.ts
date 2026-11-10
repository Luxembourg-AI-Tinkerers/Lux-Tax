import { Controller, Get, Patch, Delete, Body, Req, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserDto } from '@luxtax/contracts';
import type { FastifyRequest } from 'fastify';

@Controller('api/users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@CurrentUser('id') userId: string): Promise<UserDto> {
    return this.usersService.findById(userId);
  }

  @Patch('me/profile')
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() body: { firstName?: string; lastName?: string }
  ): Promise<UserDto> {
    return this.usersService.updateProfile(userId, body);
  }

  /**
   * M10: the sessions of this account. This is the list a user needs to notice a
   * sign-in they do not recognise, and it is why `Session.ipAddress`/`userAgent`
   * are now written.
   */
  @Get('me/sessions')
  async getSessions(@CurrentUser('id') userId: string) {
    return this.usersService.listSessions(userId);
  }

  /** M10: a machine-readable copy of everything held about this account. */
  @Get('me/export')
  async exportData(@CurrentUser('id') userId: string, @Req() req: FastifyRequest) {
    return this.usersService.exportUserData(userId, req.ip);
  }

  /**
   * M10: erase the account. Irreversible, so it is a DELETE on the user's own
   * resource rather than a flag. Ownership of a shared household blocks it.
   */
  @Delete('me')
  async eraseAccount(@CurrentUser('id') userId: string, @Req() req: FastifyRequest) {
    return this.usersService.eraseAccount(userId, req.ip);
  }
}
