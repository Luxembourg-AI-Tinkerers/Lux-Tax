import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common';
import { CalculationsService } from './calculations.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { HouseholdGuard } from '../../common/guards/household.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TaxCalculationResultDto, ScenarioComparisonDto } from '@luxtax/contracts';
import { FastifyRequest } from 'fastify';

@Controller('api/workspaces/:workspaceId')
@UseGuards(JwtAuthGuard, HouseholdGuard)
export class CalculationsController {
  constructor(private readonly calculationsService: CalculationsService) {}

  @Post('calculate')
  async calculate(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
    @Req() req: FastifyRequest,
  ): Promise<TaxCalculationResultDto> {
    return this.calculationsService.calculateTax(workspaceId, userId, req.ip);
  }

  @Get('calculation')
  async getCalculation(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<TaxCalculationResultDto | null> {
    return this.calculationsService.getLatestCalculation(workspaceId);
  }

  /**
   * One action, three assessment modes on the same facts. Non-persisting: the
   * comparison never overwrites the workspace result or the active election.
   */
  @Get('scenario-comparison')
  async scenarioComparison(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
  ): Promise<ScenarioComparisonDto> {
    return this.calculationsService.compareScenarios(workspaceId, userId);
  }
}
