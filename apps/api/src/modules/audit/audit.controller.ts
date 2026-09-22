import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { HouseholdGuard } from '../../common/guards/household.guard';
import { AuditEventType } from '@luxtax/contracts';

@Controller('api/households/:id/activity')
@UseGuards(JwtAuthGuard, HouseholdGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async getHouseholdActivity(
    @Param('id', ParseUUIDPipe) householdId: string,
    @Query('workspaceId') workspaceId?: string,
    @Query('eventType') eventType?: AuditEventType,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    return this.auditService.getHouseholdActivity(householdId, {
      workspaceId,
      eventType,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }
}
