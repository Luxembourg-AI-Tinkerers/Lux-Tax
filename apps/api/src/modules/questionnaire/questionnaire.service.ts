import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ReturnApprovalsService } from '../filing/return-approvals.service';
import {
  QuestionnaireAnswersDto,
  MissingInformationTaskDto,
  ReadinessDetailsDto,
  TaskSeverity,
  TaskType,
  DocumentType,
} from '@luxtax/contracts';
import { QuestionnaireInput } from '@luxtax/validation';

@Injectable()
export class QuestionnaireService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly returnApprovals: ReturnApprovalsService,
  ) {}

  async getProfileAndTasks(workspaceId: string): Promise<{
    answers: QuestionnaireAnswersDto;
    readiness: ReadinessDetailsDto;
  }> {
    const workspace = await this.prisma.taxYearWorkspace.findUnique({
      where: { id: workspaceId },
      include: {
        taxProfile: true,
        household: {
          include: { members: true },
        },
      },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const answers: QuestionnaireAnswersDto = workspace.taxProfile?.answersJson
      ? (workspace.taxProfile.answersJson as unknown as QuestionnaireAnswersDto)
      : {
          maritalStatus: 'SINGLE',
          hasEmploymentIncome: true,
          hasPensionIncome: false,
          hasPrimaryResidenceMortgage: false,
          hasLifeInsuranceOrPensionPlan: false,
          hasDonations: false,
          hasFreelanceIncome: false,
          childrenCount: 0,
        };

    const readiness = await this.evaluateMissingItems(workspaceId, answers);

    return { answers, readiness };
  }

  async saveProfile(
    workspaceId: string,
    userId: string,
    input: QuestionnaireInput,
    ipAddress?: string,
  ): Promise<{
    answers: QuestionnaireAnswersDto;
    readiness: ReadinessDetailsDto;
  }> {
    const workspace = await this.prisma.taxYearWorkspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    await this.prisma.taxProfile.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        maritalStatus: input.maritalStatus,
        answersJson: input as any,
      },
      update: {
        maritalStatus: input.maritalStatus,
        answersJson: input as any,
      },
    });

    // Marital status, children and the other engine inputs are return facts:
    // a saved answer after dual approval must supersede both approvals. Failure
    // is not swallowed — a stale approval is worse than a failed save.
    await this.returnApprovals.invalidateForChange(
      workspaceId,
      userId,
      'Questionnaire answers updated',
      ipAddress,
    );

    const readiness = await this.evaluateMissingItems(workspaceId, input as QuestionnaireAnswersDto);

    return { answers: input as QuestionnaireAnswersDto, readiness };
  }

  async resolveTask(workspaceId: string, taskId: string): Promise<void> {
    await this.prisma.missingInformationItem.updateMany({
      where: {
        id: taskId,
        workspaceId,
      },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
      },
    });
  }

  private async evaluateMissingItems(
    workspaceId: string,
    answers: QuestionnaireAnswersDto,
  ): Promise<ReadinessDetailsDto> {
    const workspace = await this.prisma.taxYearWorkspace.findUnique({
      where: { id: workspaceId },
      include: {
        household: {
          include: { members: true },
        },
        confirmedFacts: true,
        extractedFacts: { where: { isConfirmed: false } },
      },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    // Find tasks that were already explicitly resolved by the user
    const previouslyResolved = await this.prisma.missingInformationItem.findMany({
      where: { workspaceId, isResolved: true },
      select: { taskType: true },
    });
    const resolvedTypes = new Set(previouslyResolved.map((t) => t.taskType));

    // Delete existing unresolved automated tasks
    await this.prisma.missingInformationItem.deleteMany({
      where: { workspaceId, isResolved: false },
    });

    const tasksToCreate: Array<{
      taskType: TaskType;
      severity: TaskSeverity;
      title: string;
      description: string;
      relatedDocumentType?: DocumentType;
    }> = [];

    // 1. Employment income declared but no confirmed facts
    if (answers.hasEmploymentIncome) {
      const hasSalary = workspace.confirmedFacts.some(
        (f) => f.category === 'EMPLOYMENT_INCOME',
      );
      if (hasSalary) {
        await this.prisma.missingInformationItem.deleteMany({
          where: { workspaceId, taskType: TaskType.MISSING_SALARY_CERTIFICATE },
        });
      } else if (!resolvedTypes.has(TaskType.MISSING_SALARY_CERTIFICATE)) {
        tasksToCreate.push({
          taskType: TaskType.MISSING_SALARY_CERTIFICATE,
          severity: TaskSeverity.BLOCKER,
          title: 'Missing Salary Certificate (Certificat de rémunération)',
          description:
            'You indicated employment income, but no salary certificate has been uploaded and confirmed.',
          relatedDocumentType: DocumentType.SALARY_CERTIFICATE,
        });
      }
    }

    // 2. Primary mortgage declared but no mortgage fact
    if (answers.hasPrimaryResidenceMortgage) {
      const hasMortgage = workspace.confirmedFacts.some(
        (f) => f.category === 'MORTGAGE_DEDUCTION',
      );
      if (hasMortgage) {
        await this.prisma.missingInformationItem.deleteMany({
          where: { workspaceId, taskType: TaskType.MISSING_MORTGAGE_CERTIFICATE },
        });
      } else if (!resolvedTypes.has(TaskType.MISSING_MORTGAGE_CERTIFICATE)) {
        tasksToCreate.push({
          taskType: TaskType.MISSING_MORTGAGE_CERTIFICATE,
          severity: TaskSeverity.WARNING,
          title: 'Missing Mortgage Debit Interest Certificate',
          description:
            'Mortgage interest on your primary residence is declared, but no bank interest certificate is confirmed.',
          relatedDocumentType: DocumentType.MORTGAGE_CERTIFICATE,
        });
      }
    }

    // 3. Unconfirmed extracted facts
    if (workspace.extractedFacts.length > 0) {
      tasksToCreate.push({
        taskType: TaskType.UNCONFIRMED_FACT,
        severity: TaskSeverity.WARNING,
        title: `${workspace.extractedFacts.length} Extracted Facts Awaiting Confirmation`,
        description:
          'Documents have been processed, but extracted figures must be verified and confirmed by you.',
      });
    }

    // 4. Married joint status checks
    if (answers.maritalStatus === 'MARRIED' && workspace.household.members.length < 2) {
      tasksToCreate.push({
        taskType: TaskType.MISSING_SPOUSE_INCOME,
        severity: TaskSeverity.INFO,
        title: 'Spouse Invitation Recommended',
        description:
          'You are filing as married. Send an invitation to your spouse so they can review and approve the joint return.',
      });
    }

    // Persist tasks
    for (const t of tasksToCreate) {
      await this.prisma.missingInformationItem.create({
        data: {
          workspaceId,
          taskType: t.taskType,
          severity: t.severity,
          title: t.title,
          description: t.description,
          relatedDocumentType: t.relatedDocumentType,
        },
      });
    }

    const allTasks = await this.prisma.missingInformationItem.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });

    const unresolvedBlockers = allTasks.filter(
      (t) => !t.isResolved && t.severity === TaskSeverity.BLOCKER,
    ).length;
    const unresolvedWarnings = allTasks.filter(
      (t) => !t.isResolved && t.severity === TaskSeverity.WARNING,
    ).length;

    // Calculate score: 100 - (blockers * 40 + warnings * 15), clamped [0, 100]
    const rawScore = 100 - (unresolvedBlockers * 40 + unresolvedWarnings * 15);
    const completionScore = Math.max(0, Math.min(100, rawScore));

    // Update workspace score
    await this.prisma.taxYearWorkspace.update({
      where: { id: workspaceId },
      data: { completionScore },
    });

    return {
      workspaceId,
      taxYear: workspace.taxYear,
      completionScore,
      totalTasks: allTasks.length,
      unresolvedBlockers,
      unresolvedWarnings,
      tasks: allTasks.map((t) => ({
        id: t.id,
        workspaceId: t.workspaceId,
        taskType: t.taskType as TaskType,
        severity: t.severity as TaskSeverity,
        title: t.title,
        description: t.description,
        isResolved: t.isResolved,
        assignedToUserId: t.assignedToUserId,
        relatedDocumentType: t.relatedDocumentType as DocumentType,
        relatedFactId: t.relatedFactId,
        createdAt: t.createdAt.toISOString(),
        resolvedAt: t.resolvedAt?.toISOString() || null,
      })),
    };
  }
}
