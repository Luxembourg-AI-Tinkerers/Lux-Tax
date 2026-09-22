import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  AdminOverviewDto,
  TaxRulePackageDto,
  FormMappingDto,
  ModelDefinitionDto,
  ModelRouteDto,
  EvaluationRunDto,
  AuditEventDto,
} from '@luxtax/contracts';

@Controller('api/admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  async getOverview(): Promise<AdminOverviewDto> {
    return this.adminService.getOverview();
  }

  @Get('tax-rules')
  getTaxRules(): readonly TaxRulePackageDto[] {
    return this.adminService.getTaxRules();
  }

  @Get('forms')
  getForms(): readonly FormMappingDto[] {
    return this.adminService.getForms();
  }

  @Get('models')
  getModels(): readonly ModelDefinitionDto[] {
    return this.adminService.getModels();
  }

  @Get('model-routes')
  getModelRoutes(): readonly ModelRouteDto[] {
    return this.adminService.getModelRoutes();
  }

  @Get('evaluations')
  getEvaluations(): readonly EvaluationRunDto[] {
    return this.adminService.getEvaluations();
  }

  @Get('audit')
  async getAudit(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<readonly AuditEventDto[]> {
    return this.adminService.getAdminAudit(
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }
}
