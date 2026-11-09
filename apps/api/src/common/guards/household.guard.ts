import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { HouseholdRole, MembershipStatus } from '@luxtax/contracts';
import { ROLES_KEY } from '../decorators/roles.decorator';

/** Canonical 8-4-4-4-12 hex UUID shape; dependency-free so the guard validates before Prisma. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

@Injectable()
export class HouseholdGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('User is not authenticated');
    }

    // Resolution order: an explicit household route param wins; otherwise the
    // workspace route param decides, and its own row supplies the household.
    // The request body is never consulted: a body-supplied householdId would let
    // the caller choose which household its membership is checked against while
    // the handler still operates on the workspace named in the path (API-3 M1).
    let householdId: string | undefined = request.params.id || request.params.householdId;

    if (!householdId && request.params.workspaceId !== undefined) {
      const workspaceId = request.params.workspaceId;
      if (!isUuid(workspaceId)) {
        // Guards run before pipes, so a malformed id would otherwise reach Prisma
        // as a 22P02/P2023 and surface as an unmapped 500. Deny instead.
        throw new ForbiddenException('Invalid workspace id');
      }
      const workspace = await this.prisma.taxYearWorkspace.findUnique({
        where: { id: workspaceId },
        select: { householdId: true },
      });
      if (workspace) {
        householdId = workspace.householdId;
      }
    }

    if (!householdId) {
      // Deny by default: an unresolved household context must never bypass the check.
      throw new ForbiddenException('Household context could not be resolved for this request');
    }

    const membership = await this.prisma.householdMembership.findUnique({
      where: {
        householdId_userId: {
          householdId,
          userId: user.id,
        },
      },
    });

    if (!membership || membership.status !== MembershipStatus.ACTIVE) {
      throw new ForbiddenException('Access to household workspace is denied');
    }

    // Role check if @Roles() decorator is applied
    const requiredRoles = this.reflector.getAllAndOverride<HouseholdRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (requiredRoles && requiredRoles.length > 0) {
      if (!requiredRoles.includes(membership.role as HouseholdRole)) {
        throw new ForbiddenException('Insufficient household permissions for this action');
      }
    }

    request.householdMembership = membership;
    return true;
  }
}
