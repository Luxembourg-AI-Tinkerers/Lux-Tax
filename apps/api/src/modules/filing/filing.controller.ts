import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  BadRequestException,
  Req,
  Res,
} from '@nestjs/common';
import { FilingService } from './filing.service';
import { AnnexPdfService } from './annex-pdf.service';
import { ReturnApprovalsService } from './return-approvals.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { HouseholdGuard } from '../../common/guards/household.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { importAssessmentSchema, createFilingRecordSchema, updateAssessmentFollowUpSchema } from '@luxtax/validation';
import { ReturnVersionDto, ReturnVersionHistoryDto, FilingPackageDto, AssessmentDto, FilingRecordDto, HouseholdRole } from '@luxtax/contracts';
import { FastifyRequest, FastifyReply } from 'fastify';

@Controller('api/workspaces/:workspaceId')
@UseGuards(JwtAuthGuard, HouseholdGuard)
export class FilingController {
  constructor(
    private readonly filingService: FilingService,
    private readonly annexPdfService: AnnexPdfService,
    private readonly returnApprovalsService: ReturnApprovalsService,
  ) {}

  @Roles(HouseholdRole.PRIMARY_FILER, HouseholdRole.CO_FILER)
  @Post('approve')
  async approveReturn(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
    @Req() req: FastifyRequest,
  ): Promise<ReturnVersionDto> {
    return this.filingService.approveReturn(workspaceId, userId, req.ip);
  }

  @Roles(HouseholdRole.PRIMARY_FILER, HouseholdRole.CO_FILER)
  @Post('filing-package')
  async generatePackage(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
    @Req() req: FastifyRequest,
  ): Promise<FilingPackageDto> {
    return this.filingService.generateFilingPackage(workspaceId, userId, req.ip);
  }

  @Roles(HouseholdRole.PRIMARY_FILER, HouseholdRole.CO_FILER)
  @Post('filing-record')
  async recordFiling(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
    @Body() body: any,
    @Req() req: FastifyRequest,
  ): Promise<FilingRecordDto> {
    const parseResult = createFilingRecordSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.errors[0]?.message || 'Validation failed');
    }
    return this.filingService.recordFiling(workspaceId, userId, parseResult.data, req.ip);
  }

  @Roles(HouseholdRole.PRIMARY_FILER, HouseholdRole.CO_FILER)
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

  @Roles(HouseholdRole.PRIMARY_FILER, HouseholdRole.CO_FILER)
  @Patch('assessment/:assessmentId/follow-up')
  async updateAssessmentFollowUp(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @CurrentUser('id') userId: string,
    @Body() body: any,
    @Req() req: FastifyRequest,
  ): Promise<AssessmentDto> {
    const parseResult = updateAssessmentFollowUpSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.errors[0]?.message || 'Validation failed');
    }
    return this.filingService.updateAssessmentFollowUp(
      workspaceId,
      assessmentId,
      userId,
      parseResult.data,
      req.ip,
    );
  }

  @Roles(HouseholdRole.PRIMARY_FILER, HouseholdRole.CO_FILER)
  @Post('rollover')
  async rollover(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
    @Req() req: FastifyRequest,
  ): Promise<{ nextWorkspaceId: string; nextTaxYear: number }> {
    return this.filingService.rollOverToNextYear(workspaceId, userId, req.ip);
  }

  @Get('return-version')
  async getReturnVersion(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<ReturnVersionDto | null> {
    return this.filingService.getLatestReturnVersion(workspaceId);
  }

  /**
   * Full version history: every version, its status and all approvals —
   * including the superseded ones and the reason they were invalidated.
   */
  @Get('return-versions')
  async getReturnVersionHistory(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<ReturnVersionHistoryDto> {
    return this.returnApprovalsService.getHistory(workspaceId);
  }

  @Get('filing-package')
  async getFilingPackage(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<FilingPackageDto | null> {
    return this.filingService.getLatestFilingPackage(workspaceId);
  }

  @Roles(HouseholdRole.PRIMARY_FILER, HouseholdRole.CO_FILER)
  @Get('filing-record')
  async getFilingRecord(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<FilingRecordDto | null> {
    return this.filingService.getFilingRecord(workspaceId);
  }

  @Get('filing-package/annexes.pdf')
  async downloadAnnexes(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { buffer, filename, annexCount } = await this.annexPdfService.buildForWorkspace(
      workspaceId,
      userId,
    );
    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .header('X-Annex-Count', String(annexCount))
      .send(buffer);
  }

  @Get('assessment')
  async getAssessment(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<AssessmentDto | null> {
    return this.filingService.getLatestAssessment(workspaceId);
  }
}
