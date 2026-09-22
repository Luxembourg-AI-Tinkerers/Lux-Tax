import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateHouseholdDto,
  InviteMemberDto,
  HouseholdDto,
  HouseholdRole,
  MembershipStatus,
  AuditEventType,
  InvitationDetailsDto,
} from '@luxtax/contracts';

@Injectable()
export class HouseholdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const randomSuffix = crypto.randomBytes(3).toString('hex');
    return `${base}-${randomSuffix}`;
  }

  async createHousehold(userId: string, dto: CreateHouseholdDto): Promise<HouseholdDto> {
    const slug = this.generateSlug(dto.name);

    const household = await this.prisma.household.create({
      data: {
        name: dto.name.trim(),
        slug,
        createdById: userId,
        members: {
          create: {
            userId,
            role: HouseholdRole.PRIMARY_FILER,
            status: MembershipStatus.ACTIVE,
          },
        },
        workspaces: {
          create: {
            taxYear: 2025,
            completionScore: 0,
            activeReturnVersion: 1,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              include: { profile: true },
            },
          },
        },
      },
    });

    await this.auditService.log({
      householdId: household.id,
      actorId: userId,
      eventType: AuditEventType.HOUSEHOLD_CREATED,
      entityType: 'Household',
      entityId: household.id,
      newValue: { name: household.name, slug: household.slug },
      description: `Household "${household.name}" created`,
    });

    return this.mapToHouseholdDto(household);
  }

  async getHouseholdsForUser(userId: string): Promise<readonly HouseholdDto[]> {
    const memberships = await this.prisma.householdMembership.findMany({
      where: {
        userId,
        status: MembershipStatus.ACTIVE,
      },
      include: {
        household: {
          include: {
            members: {
              include: {
                user: {
                  include: { profile: true },
                },
              },
            },
            invitations: true,
          },
        },
      },
    });

    return memberships.map((m) => this.mapToHouseholdDto(m.household));
  }

  async getHouseholdById(householdId: string): Promise<HouseholdDto> {
    const household = await this.prisma.household.findUnique({
      where: { id: householdId },
      include: {
        members: {
          include: {
            user: {
              include: { profile: true },
            },
          },
        },
        invitations: true,
      },
    });

    if (!household) {
      throw new NotFoundException('Household not found');
    }

    return this.mapToHouseholdDto(household);
  }

  async inviteMember(
    householdId: string,
    inviterId: string,
    dto: InviteMemberDto
  ): Promise<{ invitationToken: string; invitation: any }> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // Check if user is already an active member
    const existingMember = await this.prisma.householdMembership.findFirst({
      where: {
        householdId,
        user: { email: normalizedEmail },
        status: MembershipStatus.ACTIVE,
      },
    });

    if (existingMember) {
      throw new ConflictException('This user is already an active member of the household');
    }

    // Generate single-use secure token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 72); // 72-hour expiry

    const invitation = await this.prisma.householdInvitation.create({
      data: {
        householdId,
        invitedEmail: normalizedEmail,
        invitedRole: dto.role as any,
        tokenHash,
        invitedById: inviterId,
        expiresAt,
      },
    });

    await this.auditService.log({
      householdId,
      actorId: inviterId,
      eventType: AuditEventType.MEMBER_INVITED,
      entityType: 'HouseholdInvitation',
      entityId: invitation.id,
      newValue: { invitedEmail: normalizedEmail, role: dto.role },
      description: `Invited ${normalizedEmail} as ${dto.role}`,
    });

    return {
      invitationToken: rawToken,
      invitation: {
        id: invitation.id,
        invitedEmail: invitation.invitedEmail,
        invitedRole: invitation.invitedRole,
        expiresAt: invitation.expiresAt.toISOString(),
      },
    };
  }

  async getInvitationDetails(rawToken: string): Promise<InvitationDetailsDto> {
    const tokenHash = this.hashToken(rawToken);
    const invitation = await this.prisma.householdInvitation.findUnique({
      where: { tokenHash },
      include: {
        household: true,
        invitedBy: {
          include: { profile: true },
        },
      },
    });

    if (!invitation) {
      throw new NotFoundException('Invalid invitation link');
    }

    const isExpired = new Date() > invitation.expiresAt;
    const isAccepted = !!invitation.acceptedAt;
    const isValid = !isExpired && !isAccepted && !invitation.revokedAt;

    const inviterName =
      invitation.invitedBy.profile?.firstName && invitation.invitedBy.profile?.lastName
        ? `${invitation.invitedBy.profile.firstName} ${invitation.invitedBy.profile.lastName}`
        : invitation.invitedBy.email;

    return {
      id: invitation.id,
      householdName: invitation.household.name,
      invitedEmail: invitation.invitedEmail,
      invitedRole: invitation.invitedRole as HouseholdRole,
      inviterName,
      expiresAt: invitation.expiresAt.toISOString(),
      isValid,
    };
  }

  async acceptInvitation(userId: string, rawToken: string): Promise<HouseholdDto> {
    const tokenHash = this.hashToken(rawToken);

    const invitation = await this.prisma.householdInvitation.findUnique({
      where: { tokenHash },
      include: { household: true },
    });

    if (!invitation) {
      throw new NotFoundException('Invalid invitation link');
    }

    if (new Date() > invitation.expiresAt) {
      throw new BadRequestException('Invitation has expired');
    }

    if (invitation.acceptedAt) {
      throw new BadRequestException('Invitation has already been accepted');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Upsert membership
    await this.prisma.householdMembership.upsert({
      where: {
        householdId_userId: {
          householdId: invitation.householdId,
          userId,
        },
      },
      create: {
        householdId: invitation.householdId,
        userId,
        role: invitation.invitedRole,
        status: MembershipStatus.ACTIVE,
      },
      update: {
        role: invitation.invitedRole,
        status: MembershipStatus.ACTIVE,
      },
    });

    // Mark invitation accepted
    await this.prisma.householdInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });

    await this.auditService.log({
      householdId: invitation.householdId,
      actorId: userId,
      eventType: AuditEventType.MEMBER_JOINED,
      entityType: 'HouseholdMembership',
      entityId: `${invitation.householdId}_${userId}`,
      newValue: { role: invitation.invitedRole },
      description: `User ${user.email} joined household as ${invitation.invitedRole}`,
    });

    return this.getHouseholdById(invitation.householdId);
  }

  private mapToHouseholdDto(household: any): HouseholdDto {
    return {
      id: household.id,
      name: household.name,
      slug: household.slug,
      createdById: household.createdById,
      createdAt: household.createdAt.toISOString(),
      members: household.members?.map((m: any) => ({
        id: m.id,
        userId: m.userId,
        householdId: m.householdId,
        role: m.role as HouseholdRole,
        status: m.status as MembershipStatus,
        joinedAt: m.joinedAt?.toISOString(),
        user: m.user
          ? {
              id: m.user.id,
              email: m.user.email,
              firstName: m.user.profile?.firstName || undefined,
              lastName: m.user.profile?.lastName || undefined,
              isEmailVerified: m.user.isEmailVerified,
              createdAt: m.user.createdAt.toISOString(),
            }
          : undefined,
      })),
      invitations: household.invitations?.map((inv: any) => ({
        id: inv.id,
        householdId: inv.householdId,
        invitedEmail: inv.invitedEmail,
        invitedRole: inv.invitedRole as HouseholdRole,
        invitedByUserId: inv.invitedById,
        expiresAt: inv.expiresAt.toISOString(),
        acceptedAt: inv.acceptedAt?.toISOString(),
        isExpired: new Date() > inv.expiresAt,
      })),
    };
  }
}
