import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AnnexRequestDto } from '@luxtax/contracts';
import { buildAnnexPdf } from './annex-pdf.builder';
import { selectFilerMembers } from '../calculations/class-resolution';

@Injectable()
export class AnnexPdfService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Render the persisted annexes of the active filing package as a PDF.
   * Throws when the package has not been generated yet, or when the package
   * carries no annex.
   */
  async buildForWorkspace(
    workspaceId: string,
    actorId?: string,
  ): Promise<{ buffer: Buffer; filename: string; annexCount: number }> {
    const workspace = await this.prisma.taxYearWorkspace.findUnique({
      where: { id: workspaceId },
      include: {
        household: {
          include: {
            members: { include: { user: { include: { profile: true } } } },
          },
        },
      },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const returnVersion = await this.prisma.returnVersion.findFirst({
      where: { workspaceId, versionNumber: workspace.activeReturnVersion },
      include: { filingPackage: true },
    });

    const filingPackage = returnVersion?.filingPackage;
    if (!filingPackage) {
      throw new BadRequestException('Generate the filing package first: no annex to render.');
    }

    const annexes = ((filingPackage.annexesJson as unknown as AnnexRequestDto[]) ?? []).filter(Boolean);
    if (annexes.length === 0) {
      throw new BadRequestException('This filing package has no annex.');
    }

    // The annex belongs to the return's primary filer, not to whoever happens to
    // be first in the membership list (which can be a CO_FILER or a VIEWER).
    const members = workspace.household.members;
    // Same actor-aware selection as the filing package, so the annex and the
    // 100F boxes name the same taxpayer when a CO_FILER generates them.
    const { primaryUserId } = selectFilerMembers(members, actorId);
    const primary = members.find((m) => m.userId === primaryUserId) ?? members[0];
    const profile = primary?.user?.profile;
    const taxpayer = profile
      ? [profile.firstName, profile.lastName].filter(Boolean).join(' ') || primary?.user?.email
      : primary?.user?.email;

    const buffer = buildAnnexPdf(
      {
        taxYear: filingPackage.taxYear,
        taxClass: filingPackage.taxClass as unknown as string,
        householdName: workspace.household.name,
        taxpayer: taxpayer ?? null,
        generatedAt: filingPackage.generatedAt.toISOString(),
        packageHash: filingPackage.packageSha256,
      },
      annexes,
    );

    return {
      buffer,
      filename: `luxtax-annexes-${filingPackage.taxYear}-${filingPackage.packageSha256.slice(0, 8)}.pdf`,
      annexCount: annexes.length,
    };
  }
}
