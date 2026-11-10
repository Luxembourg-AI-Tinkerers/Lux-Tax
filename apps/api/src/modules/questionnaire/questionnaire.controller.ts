import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { QuestionnaireService } from './questionnaire.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { HouseholdGuard } from '../../common/guards/household.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { questionnaireSchema } from '@luxtax/validation';
import { QuestionnaireAnswersDto, ReadinessDetailsDto, HouseholdRole } from '@luxtax/contracts';

@Controller('api/workspaces/:workspaceId')
@UseGuards(JwtAuthGuard, HouseholdGuard)
export class QuestionnaireController {
  constructor(private readonly questionnaireService: QuestionnaireService) {}

  @Get('questionnaire')
  async getProfile(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<{ answers: QuestionnaireAnswersDto; readiness: ReadinessDetailsDto }> {
    return this.questionnaireService.getProfileAndTasks(workspaceId);
  }

  @Roles(HouseholdRole.PRIMARY_FILER, HouseholdRole.CO_FILER)
  @Put('questionnaire')
  async saveProfile(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
    @Body() body: any,
    @Req() req: FastifyRequest,
  ): Promise<{ answers: QuestionnaireAnswersDto; readiness: ReadinessDetailsDto }> {
    const parseResult = questionnaireSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.issues[0]?.message || 'Validation failed');
    }
    return this.questionnaireService.saveProfile(
      workspaceId,
      userId,
      parseResult.data,
      req.ip,
    );
  }

  @Roles(HouseholdRole.PRIMARY_FILER, HouseholdRole.CO_FILER)
  @Post('tasks/:taskId/resolve')
  async resolveTask(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ): Promise<{ success: boolean }> {
    await this.questionnaireService.resolveTask(workspaceId, taskId);
    return { success: true };
  }
}
