import { BadRequestException } from '@nestjs/common';
import { MembershipStatus } from '@luxtax/contracts';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * A fact or a freelance profile may be attributed to another household member
 * ("record this on behalf of my spouse"), but never to an arbitrary user id:
 * the owner must be an ACTIVE member of the household that owns the workspace.
 * Mirrors the owner check `documents.service.ts` applies on upload, so a body
 * or path parameter cannot attribute a record to a stranger — which would both
 * forge an owner and hide the record behind another user's visibility scope.
 */
export async function assertActiveHouseholdMember(
  prisma: PrismaService,
  householdId: string,
  userId: string,
  message: string,
): Promise<void> {
  const membership = await prisma.householdMembership.findUnique({
    where: {
      householdId_userId: {
        householdId,
        userId,
      },
    },
  });

  if (!membership || membership.status !== MembershipStatus.ACTIVE) {
    throw new BadRequestException(message);
  }
}
