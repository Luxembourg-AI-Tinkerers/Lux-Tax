import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { HouseholdGuard } from '../../common/guards/household.guard';
import { AuditEventType, HouseholdRole } from '@luxtax/contracts';

/** `HouseholdGuard` resolved the caller's membership before this handler. */
interface HouseholdRequest extends FastifyRequest {
  householdMembership?: { role?: string };
}

@Controller('api/households/:id/activity')
@UseGuards(JwtAuthGuard, HouseholdGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async getHouseholdActivity(
    @Param('id', ParseUUIDPipe) householdId: string,
    @Req() req: HouseholdRequest,
    @Query('workspaceId') workspaceId?: string,
    @Query('eventType') eventType?: AuditEventType,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    // The feed stays readable by every active member, but only a filer sees the
    // actor's e-mail, IP, user agent and private-draft names.
    const role = req.householdMembership?.role;

    return this.auditService.getHouseholdActivity(
      householdId,
      {
        workspaceId,
        eventType,
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
      },
      {
        includePrivateDetails:
          role === HouseholdRole.PRIMARY_FILER || role === HouseholdRole.CO_FILER,
      },
    );
  }
}
