import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { FactsService } from './facts.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { HouseholdGuard } from '../../common/guards/household.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { confirmFactSchema, confirmFactsBulkSchema, updateFactSchema } from '@luxtax/validation';
import { ConfirmedFactDto, ExtractedFactDto, HouseholdRole } from '@luxtax/contracts';
import { FastifyRequest } from 'fastify';

@Controller('api/workspaces/:workspaceId/facts')
@UseGuards(JwtAuthGuard, HouseholdGuard)
export class FactsController {
  constructor(private readonly factsService: FactsService) {}

  @Get()
  async getFacts(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ extractedFacts: ExtractedFactDto[]; confirmedFacts: ConfirmedFactDto[] }> {
    return this.factsService.getFactsForWorkspace(workspaceId, userId);
  }

  @Roles(HouseholdRole.PRIMARY_FILER, HouseholdRole.CO_FILER)
  @Post('confirm')
  async confirmFact(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
    @Body() body: any,
    @Req() req: FastifyRequest,
  ): Promise<ConfirmedFactDto> {
    const parseResult = confirmFactSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.issues[0]?.message || 'Validation failed');
    }
    return this.factsService.confirmFact(workspaceId, userId, parseResult.data, req.ip);
  }

  /**
   * Confirms several figures of one document at once.
   *
   * The route is separate from `POST confirm` because the response shape is
   * different: a batch reports what it could not confirm instead of failing
   * whole, which is what a client retrying a partial import needs.
   */
  @Roles(HouseholdRole.PRIMARY_FILER, HouseholdRole.CO_FILER)
  @Post('confirm-bulk')
  async confirmFactsBulk(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
    @Body() body: any,
    @Req() req: FastifyRequest,
  ): Promise<{ confirmed: ConfirmedFactDto[]; skipped: Array<{ id: string; reason: string }> }> {
    const parseResult = confirmFactsBulkSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.issues[0]?.message || 'Validation failed');
    }
    return this.factsService.confirmFactsBulk(workspaceId, userId, parseResult.data, req.ip);
  }

  @Roles(HouseholdRole.PRIMARY_FILER, HouseholdRole.CO_FILER)
  @Patch(':factId')
  async updateFact(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('factId', ParseUUIDPipe) factId: string,
    @CurrentUser('id') userId: string,
    @Body() body: any,
    @Req() req: FastifyRequest,
  ): Promise<ConfirmedFactDto> {
    const parseResult = updateFactSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.issues[0]?.message || 'Validation failed');
    }
    return this.factsService.updateFact(workspaceId, factId, userId, parseResult.data, req.ip);
  }

  @Roles(HouseholdRole.PRIMARY_FILER, HouseholdRole.CO_FILER)
  @Delete(':factId')
  async deleteFact(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('factId', ParseUUIDPipe) factId: string,
    @CurrentUser('id') userId: string,
    @Req() req: FastifyRequest,
  ): Promise<{ success: boolean }> {
    await this.factsService.deleteFact(workspaceId, factId, userId, req.ip);
    return { success: true };
  }
}
