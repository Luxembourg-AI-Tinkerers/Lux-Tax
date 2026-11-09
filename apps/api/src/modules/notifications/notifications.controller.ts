import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  BadRequestException,
  ForbiddenException,
  Req,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { HouseholdGuard } from '../../common/guards/household.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { updateNotificationPreferencesSchema } from '@luxtax/validation';
import {
  NotificationListDto,
  NotificationPreferenceDto,
} from '@luxtax/contracts';

/** `HouseholdGuard` resolved the workspace's household before this handler. */
interface HouseholdRequest extends FastifyRequest {
  householdMembership?: { householdId?: string };
}

@Controller('api/workspaces/:workspaceId/notifications')
@UseGuards(JwtAuthGuard, HouseholdGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async list(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
    @Query('unreadOnly') unreadOnly?: string,
  ): Promise<NotificationListDto> {
    return this.notificationsService.list(workspaceId, userId, {
      unreadOnly: unreadOnly === 'true' || unreadOnly === '1',
    });
  }

  @Get('unread-count')
  async unreadCount(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ unreadCount: number }> {
    const unreadCount = await this.notificationsService.unreadCount(
      workspaceId,
      userId,
    );
    return { unreadCount };
  }

  @Patch(':notificationId/read')
  async markRead(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ success: boolean }> {
    return this.notificationsService.markRead(
      workspaceId,
      notificationId,
      userId,
    );
  }

  @Post('read-all')
  async markAllRead(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ updated: number }> {
    return this.notificationsService.markAllRead(workspaceId, userId);
  }

  @Get('preferences')
  async getPreferences(
    @CurrentUser('id') userId: string,
    @Req() req: HouseholdRequest,
  ): Promise<NotificationPreferenceDto> {
    return this.notificationsService.getPreferences(
      this.householdIdOf(req),
      userId,
    );
  }

  @Put('preferences')
  async updatePreferences(
    @CurrentUser('id') userId: string,
    @Body() body: any,
    @Req() req: HouseholdRequest,
  ): Promise<NotificationPreferenceDto> {
    const parseResult = updateNotificationPreferencesSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(
        parseResult.error.errors[0]?.message || 'Validation failed',
      );
    }

    return this.notificationsService.updatePreferences(
      this.householdIdOf(req),
      userId,
      parseResult.data,
    );
  }

  private householdIdOf(req: HouseholdRequest): string {
    const householdId = req.householdMembership?.householdId;
    if (!householdId) {
      throw new ForbiddenException(
        'Household context could not be resolved for this request',
      );
    }
    return householdId;
  }
}
