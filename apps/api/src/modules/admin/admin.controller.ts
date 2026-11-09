import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  AdminOverviewDto,
  TaxRulePackageDto,
  FormMappingDto,
  ModelDefinitionDto,
  ModelRouteDto,
  EvaluationRunDto,
  AuditEventDto,
  TaxDeadlineDto,
  CreateModelDto,
  UpdateModelDto,
  TestModelConnectionDto,
  TestModelConnectionResultDto,
  UpdateModelRouteDto,
} from '@luxtax/contracts';
import {
  createModelSchema,
  updateModelSchema,
  testModelConnectionSchema,
  updateModelRouteSchema,
} from '@luxtax/validation';

// Interim gate: every route below requires an account named in the operator-managed
// ADMIN_EMAILS allowlist. The full nine-role platform RBAC (plan §5.1) is a follow-up.
@Controller('api/admin')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
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

  @Get('deadlines')
  getDeadlines(): readonly TaxDeadlineDto[] {
    return this.adminService.getDeadlines();
  }

  @Get('forms')
  getForms(): readonly FormMappingDto[] {
    return this.adminService.getForms();
  }

  @Get('models')
  async getModels(): Promise<readonly ModelDefinitionDto[]> {
    return this.adminService.getModels();
  }

  @Post('models')
  async createModel(
    @Body() body: CreateModelDto,
    @CurrentUser() user: any
  ): Promise<ModelDefinitionDto> {
    const parse = createModelSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.errors[0]?.message || 'Invalid model definition');
    }
    return this.adminService.createModel(
      parse.data as CreateModelDto,
      user?.id || 'admin-system',
      user?.email || 'admin@luxembourg-tax.local'
    );
  }

  @Put('models/:id')
  async updateModel(
    @Param('id') id: string,
    @Body() body: UpdateModelDto,
    @CurrentUser() user: any
  ): Promise<ModelDefinitionDto> {
    const parse = updateModelSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.errors[0]?.message || 'Invalid update data');
    }
    return this.adminService.updateModel(
      id,
      parse.data as UpdateModelDto,
      user?.id || 'admin-system',
      user?.email || 'admin@luxembourg-tax.local'
    );
  }

  @Delete('models/:id')
  async deleteModel(
    @Param('id') id: string,
    @CurrentUser() user: any
  ): Promise<{ success: boolean; message: string }> {
    return this.adminService.deleteModel(
      id,
      user?.id || 'admin-system',
      user?.email || 'admin@luxembourg-tax.local'
    );
  }

  @Post('models/test')
  async testModelConnection(
    @Body() body: TestModelConnectionDto
  ): Promise<TestModelConnectionResultDto> {
    const parse = testModelConnectionSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.errors[0]?.message || 'Invalid connection test payload');
    }
    return this.adminService.testModelConnection(parse.data);
  }

  @Get('model-routes')
  async getModelRoutes(): Promise<readonly ModelRouteDto[]> {
    return this.adminService.getModelRoutes();
  }

  @Put('model-routes/:id')
  async updateModelRoute(
    @Param('id') id: string,
    @Body() body: UpdateModelRouteDto,
    @CurrentUser() user: any
  ): Promise<ModelRouteDto> {
    const parse = updateModelRouteSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.errors[0]?.message || 'Invalid route update data');
    }
    return this.adminService.updateModelRoute(
      id,
      parse.data,
      user?.id || 'admin-system',
      user?.email || 'admin@luxembourg-tax.local'
    );
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
