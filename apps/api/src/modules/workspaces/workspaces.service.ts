import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  TaxYearWorkspaceDto,
  InitWorkspaceDto,
  WorkspaceReadinessDto,
  WorkspaceStatus,
  TaxResidence,
  TaxClass,
  AuditEventType,
} from '@luxtax/contracts';

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async getWorkspacesForHousehold(householdId: string): Promise<readonly TaxYearWorkspaceDto[]> {
    const workspaces = await this.prisma.taxYearWorkspace.findMany({
      where: { householdId },
      orderBy: { taxYear: 'desc' },
    });

    return workspaces.map(this.mapToWorkspaceDto);
  }

  async getWorkspaceByYear(
    householdId: string,
    taxYear: number
  ): Promise<TaxYearWorkspaceDto> {
    const workspace = await this.prisma.taxYearWorkspace.findUnique({
      where: {
        householdId_taxYear: {
          householdId,
          taxYear,
        },
      },
    });

    if (!workspace) {
      throw new NotFoundException(`Workspace for tax year ${taxYear} not found`);
    }

    return this.mapToWorkspaceDto(workspace);
  }

  async initWorkspace(
    householdId: string,
    userId: string,
    dto: InitWorkspaceDto
  ): Promise<TaxYearWorkspaceDto> {
    const existing = await this.prisma.taxYearWorkspace.findUnique({
      where: {
        householdId_taxYear: {
          householdId,
          taxYear: dto.taxYear,
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Workspace for tax year ${dto.taxYear} already exists`);
    }

    const workspace = await this.prisma.taxYearWorkspace.create({
      data: {
        householdId,
        taxYear: dto.taxYear,
        status: WorkspaceStatus.COLLECTING,
        residenceStatus: dto.residenceStatus as any,
        taxClass: dto.taxClass as any,
        completionScore: 10, // Base score for initialization
        activeReturnVersion: 1,
      },
    });

    await this.auditService.log({
      householdId,
      workspaceId: workspace.id,
      actorId: userId,
      eventType: AuditEventType.WORKSPACE_INITIALIZED,
      entityType: 'TaxYearWorkspace',
      entityId: workspace.id,
      newValue: { taxYear: dto.taxYear, residenceStatus: dto.residenceStatus },
      description: `Tax year ${dto.taxYear} workspace initialized`,
    });

    return this.mapToWorkspaceDto(workspace);
  }

  async getReadiness(householdId: string, taxYear: number): Promise<WorkspaceReadinessDto> {
    const workspace = await this.prisma.taxYearWorkspace.findUnique({
      where: {
        householdId_taxYear: {
          householdId,
          taxYear,
        },
      },
      include: {
        household: {
          include: {
            members: true,
          },
        },
      },
    });

    if (!workspace) {
      throw new NotFoundException(`Workspace for tax year ${taxYear} not found`);
    }

    const memberReadiness: Record<string, number> = {};
    for (const member of workspace.household.members) {
      // In Phase 1 foundation: baseline member readiness calculation
      memberReadiness[member.userId] = workspace.completionScore;
    }

    return {
      workspaceId: workspace.id,
      overallPercentage: workspace.completionScore,
      memberReadiness,
      criticalWarningsCount: 0,
      missingDocumentsCount: 0,
      unconfirmedFactsCount: 0,
      canCalculate: workspace.completionScore >= 50,
      canApprove: workspace.status === WorkspaceStatus.HOUSEHOLD_REVIEW,
    };
  }

  private mapToWorkspaceDto(workspace: any): TaxYearWorkspaceDto {
    return {
      id: workspace.id,
      householdId: workspace.householdId,
      taxYear: workspace.taxYear,
      status: workspace.status as WorkspaceStatus,
      completionScore: workspace.completionScore,
      activeReturnVersion: workspace.activeReturnVersion,
      residenceStatus: workspace.residenceStatus as TaxResidence,
      taxClass: workspace.taxClass as TaxClass | undefined,
      estimatedTaxBalance: workspace.estimatedTaxBalance
        ? workspace.estimatedTaxBalance.toString()
        : undefined,
      createdAt: workspace.createdAt.toISOString(),
      updatedAt: workspace.updatedAt.toISOString(),
    };
  }
}
