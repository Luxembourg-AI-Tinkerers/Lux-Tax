import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { HouseholdRole } from '@luxtax/contracts';
import { HouseholdGuard } from '../../common/guards/household.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { initWorkspaceSchema } from '@luxtax/validation';
import {
  TaxYearWorkspaceDto,
  InitWorkspaceDto,
  WorkspaceReadinessDto,
} from '@luxtax/contracts';

@Controller('api/households/:id/workspaces')
@UseGuards(JwtAuthGuard, HouseholdGuard)
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get()
  async getWorkspaces(
    @Param('id', ParseUUIDPipe) householdId: string
  ): Promise<readonly TaxYearWorkspaceDto[]> {
    return this.workspacesService.getWorkspacesForHousehold(householdId);
  }

  @Get(':year')
  async getWorkspaceByYear(
    @Param('id', ParseUUIDPipe) householdId: string,
    @Param('year', ParseIntPipe) year: number
  ): Promise<TaxYearWorkspaceDto> {
    return this.workspacesService.getWorkspaceByYear(householdId, year);
  }

  @Roles(HouseholdRole.PRIMARY_FILER, HouseholdRole.CO_FILER)
  @Post()
  async initWorkspace(
    @Param('id', ParseUUIDPipe) householdId: string,
    @CurrentUser('id') userId: string,
    @Body() body: InitWorkspaceDto
  ): Promise<TaxYearWorkspaceDto> {
    const parseResult = initWorkspaceSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.issues[0]?.message || 'Validation failed');
    }
    return this.workspacesService.initWorkspace(householdId, userId, parseResult.data);
  }

  @Get(':year/readiness')
  async getReadiness(
    @Param('id', ParseUUIDPipe) householdId: string,
    @Param('year', ParseIntPipe) year: number
  ): Promise<WorkspaceReadinessDto> {
    return this.workspacesService.getReadiness(householdId, year);
  }
}
