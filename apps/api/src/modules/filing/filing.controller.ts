import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { FilingService } from './filing.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { HouseholdGuard } from '../../common/guards/household.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { importAssessmentSchema } from '@luxtax/validation';
import { ReturnVersionDto, FilingPackageDto, AssessmentDto } from '@luxtax/contracts';
import { FastifyRequest } from 'fastify';

@Controller('api/workspaces/:workspaceId')
@UseGuards(JwtAuthGuard, HouseholdGuard)
export class FilingController {
  constructor(private readonly filingService: FilingService) {}

  @Post('approve')
  async approveReturn(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
    @Req() req: FastifyRequest,
  ): Promise<ReturnVersionDto> {
    return this.filingService.approveReturn(workspaceId, userId, req.ip);
  }

  @Post('filing-package')
  async generatePackage(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
    @Req() req: FastifyRequest,
  ): Promise<FilingPackageDto> {
    return this.filingService.generateFilingPackage(workspaceId, userId, req.ip);
  }

  @Post('assessment')
  async importAssessment(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
    @Body() body: any,
    @Req() req: FastifyRequest,
  ): Promise<AssessmentDto> {
    const parseResult = importAssessmentSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.errors[0]?.message || 'Validation failed');
    }
    return this.filingService.importAssessment(workspaceId, userId, parseResult.data, req.ip);
  }

  @Post('rollover')
  async rollover(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
    @Req() req: FastifyRequest,
  ): Promise<{ nextWorkspaceId: string; nextTaxYear: number }> {
    return this.filingService.rollOverToNextYear(workspaceId, userId, req.ip);
  }
}
