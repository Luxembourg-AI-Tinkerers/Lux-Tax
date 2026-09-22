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
} from '@nestjs/common';
import { QuestionnaireService } from './questionnaire.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { HouseholdGuard } from '../../common/guards/household.guard';
import { questionnaireSchema } from '@luxtax/validation';
import { QuestionnaireAnswersDto, ReadinessDetailsDto } from '@luxtax/contracts';

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

  @Put('questionnaire')
  async saveProfile(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() body: any,
  ): Promise<{ answers: QuestionnaireAnswersDto; readiness: ReadinessDetailsDto }> {
    const parseResult = questionnaireSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.errors[0]?.message || 'Validation failed');
    }
    return this.questionnaireService.saveProfile(workspaceId, parseResult.data);
  }

  @Post('tasks/:taskId/resolve')
  async resolveTask(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ): Promise<{ success: boolean }> {
    await this.questionnaireService.resolveTask(workspaceId, taskId);
    return { success: true };
  }
}
