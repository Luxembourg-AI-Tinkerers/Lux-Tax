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

    let householdId =
      request.params.id || request.params.householdId || request.body?.householdId;

    if (!householdId && (request.params.workspaceId || request.body?.workspaceId)) {
      const wsId = request.params.workspaceId || request.body?.workspaceId;
      const ws = await this.prisma.taxYearWorkspace.findUnique({
        where: { id: wsId },
        select: { householdId: true },
      });
      if (ws) {
        householdId = ws.householdId;
      }
    }

    if (!householdId) {
      // If no household ID is in the route, skip check or fail safe
      return true;
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
