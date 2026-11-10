import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { FreelanceService } from './freelance.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { HouseholdGuard } from '../../common/guards/household.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { updateFreelanceProfileSchema } from '@luxtax/validation';
import {
  FreelanceBusinessProfileDto,
  FreelanceMetricsDto,
  HouseholdRole,
} from '@luxtax/contracts';

@Controller('api/workspaces/:workspaceId/freelance')
@UseGuards(JwtAuthGuard, HouseholdGuard)
export class FreelanceController {
  constructor(private readonly freelanceService: FreelanceService) {}

  @Get('profiles')
  async getProfiles(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<FreelanceBusinessProfileDto[]> {
    return this.freelanceService.getProfiles(workspaceId);
  }

  @Roles(HouseholdRole.PRIMARY_FILER, HouseholdRole.CO_FILER)
  @Put('profiles/:ownerId')
  async updateProfile(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('ownerId', ParseUUIDPipe) ownerId: string,
    @Body() body: any,
  ): Promise<FreelanceBusinessProfileDto> {
    const parseResult = updateFreelanceProfileSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.issues[0]?.message || 'Validation failed');
    }
    return this.freelanceService.updateProfile(workspaceId, ownerId, parseResult.data);
  }

  @Get('metrics')
  async getMetrics(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
    @Query('ownerId') ownerId?: string,
  ): Promise<FreelanceMetricsDto> {
    return this.freelanceService.getMetrics(workspaceId, userId, ownerId);
  }

  @Roles(HouseholdRole.PRIMARY_FILER, HouseholdRole.CO_FILER)
  @Post('demo')
  async loadDemo(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ success: boolean; count: number }> {
    return this.freelanceService.loadDemoData(workspaceId, userId);
  }
}
