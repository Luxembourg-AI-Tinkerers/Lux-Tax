import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  TaxCalculationResultDto,
  TaxClass,
  TaxResidence,
  AuditEventType,
  WorkspaceStatus,
} from '@luxtax/contracts';
import { LuxembourgTaxEngine } from '@luxtax/tax-engine';
import { Prisma } from '@prisma/client';

@Injectable()
export class CalculationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async calculateTax(
    workspaceId: string,
    actorId: string,
    ipAddress?: string,
  ): Promise<TaxCalculationResultDto> {
    const workspace = await this.prisma.taxYearWorkspace.findUnique({
      where: { id: workspaceId },
      include: {
        household: {
          include: {
            members: true,
            dependants: true,
          },
        },
        confirmedFacts: {
          where: { isIncludedInReturn: true },
        },
      },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const members = workspace.household.members;
    const primaryMember = members[0];
    const spouseMember = members.length > 1 ? members[1] : null;

    // Determine tax class
    let taxClass = workspace.taxClass;
    if (!taxClass) {
      if (members.length >= 2) {
        taxClass = TaxClass.CLASS_2;
      } else if (workspace.household.dependants.length > 0) {
        taxClass = TaxClass.CLASS_1A;
      } else {
        taxClass = TaxClass.CLASS_1;
      }
    }

    // Prepare facts for calculation engine
    const factsInput = workspace.confirmedFacts.map((f) => ({
      id: f.id,
      ownerId: f.ownerId,
      category: f.category,
      fieldKey: f.fieldKey,
      amount: Number(f.amount),
      sourceDocumentId: f.sourceDocumentId,
    }));

    const result = LuxembourgTaxEngine.calculate({
      taxYear: workspace.taxYear,
      taxClass: taxClass as TaxClass,
      residence: workspace.residenceStatus as TaxResidence,
      facts: factsInput,
      primaryUserId: primaryMember ? primaryMember.userId : actorId,
      spouseUserId: spouseMember ? spouseMember.userId : null,
      dependantsCount: workspace.household.dependants.length,
    });

    // Save calculation snapshot to workspace
    await this.prisma.taxYearWorkspace.update({
      where: { id: workspaceId },
      data: {
        taxClass: taxClass as TaxClass,
        estimatedTaxBalance: new Prisma.Decimal(result.balancePayableOrRefund),
        calculationResult: result as any,
        status:
          workspace.status === WorkspaceStatus.DRAFT ||
          workspace.status === WorkspaceStatus.COLLECTING ||
          workspace.status === WorkspaceStatus.NEEDS_REVIEW
            ? WorkspaceStatus.CALCULATED
            : workspace.status,
      },
    });

    await this.auditService.logEvent({
      householdId: workspace.householdId,
      workspaceId,
      actorId,
      eventType: AuditEventType.TAX_CALCULATED,
      entityType: 'TaxCalculation',
      entityId: workspaceId,
      newValue: {
        taxYear: result.taxYear,
        taxClass: result.taxClass,
        taxableIncome: result.taxableIncome,
        finalTaxLiability: result.finalTaxLiability,
        balance: result.balancePayableOrRefund,
      },
      description: `Calculated estimated tax for ${result.taxYear} (${result.taxClass}): balance = ${result.balancePayableOrRefund} EUR`,
      ipAddress,
    });

    return result;
  }

  async getLatestCalculation(workspaceId: string): Promise<TaxCalculationResultDto | null> {
    const workspace = await this.prisma.taxYearWorkspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace || !workspace.calculationResult) {
      return null;
    }

    return workspace.calculationResult as unknown as TaxCalculationResultDto;
  }
}
