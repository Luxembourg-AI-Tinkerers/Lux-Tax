import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserDto, AuditEventType } from '@luxtax/contracts';
import * as crypto from 'crypto';

/**
 * M10 — retention, erasure and export.
 *
 * Policy this implements (see docs/data-retention.md):
 *
 * - **Export**: a user can obtain everything held about them as one JSON
 *   document, on demand, without an operator.
 * - **Erasure**: a user can erase their account. The identity is anonymised, the
 *   credentials are destroyed and the sessions revoked; the rows that other
 *   people's tax records depend on (a jointly filed return) are detached rather
 *   than destroyed, because deleting them would corrupt someone else's record.
 * - **Retention**: the raw text a model read from a document is cleared once its
 *   facts are confirmed (`facts.service.ts`), expired sessions are deleted as new
 *   ones are issued (`auth.service.ts`), and audit rows are kept — they are the
 *   accountability record — with a role-gated purge for the retention window.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findById(id: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { profile: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.profile?.firstName || undefined,
      lastName: user.profile?.lastName || undefined,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async updateProfile(
    userId: string,
    data: { firstName?: string; lastName?: string }
  ): Promise<UserDto> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        profile: {
          upsert: {
            create: {
              firstName: data.firstName?.trim(),
              lastName: data.lastName?.trim(),
            },
            update: {
              firstName: data.firstName?.trim(),
              lastName: data.lastName?.trim(),
            },
          },
        },
      },
      include: { profile: true },
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.profile?.firstName || undefined,
      lastName: user.profile?.lastName || undefined,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt.toISOString(),
    };
  }

  /** The sessions of one user, newest first — the list a user reviews. */
  async listSessions(userId: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        revokedAt: true,
        ipAddress: true,
        userAgent: true,
      },
    });

    return sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      revokedAt: session.revokedAt ? session.revokedAt.toISOString() : undefined,
      ipAddress: session.ipAddress ?? undefined,
      userAgent: session.userAgent ?? undefined,
      active: !session.revokedAt && session.expiresAt > new Date(),
    }));
  }

  /**
   * Everything held about one user, as a single JSON document.
   *
   * Scoped to what is *theirs*: facts they own, documents they uploaded, the
   * households they belong to and their own audit events. Another member's
   * private facts are not part of this user's data and are not exported.
   */
  async exportUserData(userId: string, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const memberships = await this.prisma.householdMembership.findMany({
      where: { userId },
      include: { household: { select: { id: true, name: true, createdAt: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const householdIds = memberships.map((m) => m.householdId);

    const workspaces = await this.prisma.taxYearWorkspace.findMany({
      where: { householdId: { in: householdIds } },
      select: {
        id: true,
        householdId: true,
        taxYear: true,
        status: true,
        taxClass: true,
        activeReturnVersion: true,
        createdAt: true,
      },
      orderBy: [{ taxYear: 'asc' }],
    });
    const workspaceIds = workspaces.map((w) => w.id);

    const [facts, documents, filingRecords, auditEvents, sessions] = await Promise.all([
      this.prisma.confirmedFact.findMany({
        where: { workspaceId: { in: workspaceIds }, ownerId: userId },
        select: {
          id: true,
          workspaceId: true,
          category: true,
          fieldKey: true,
          amount: true,
          currency: true,
          taxYear: true,
          isSharedWithHousehold: true,
          isIncludedInReturn: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.document.findMany({
        where: { workspaceId: { in: workspaceIds }, uploaderId: userId },
        select: {
          id: true,
          workspaceId: true,
          fileName: true,
          mimeType: true,
          fileSize: true,
          documentType: true,
          visibility: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.filingRecord.findMany({
        where: { workspaceId: { in: workspaceIds } },
        select: {
          id: true,
          workspaceId: true,
          filedAt: true,
          route: true,
          confirmationReference: true,
          createdAt: true,
        },
      }),
      this.prisma.auditEvent.findMany({
        where: { actorId: userId },
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: {
          id: true,
          householdId: true,
          workspaceId: true,
          eventType: true,
          entityType: true,
          entityId: true,
          description: true,
          ipAddress: true,
          createdAt: true,
        },
      }),
      this.prisma.session.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, createdAt: true, expiresAt: true, revokedAt: true, ipAddress: true, userAgent: true },
      }),
    ]);

    // The export itself is an access to personal data, so it is recorded.
    await this.auditService.log({
      actorId: userId,
      actorEmail: user.email,
      eventType: AuditEventType.USER_DATA_EXPORTED,
      entityType: 'User',
      entityId: userId,
      description: `User ${user.email} exported their data`,
      ipAddress,
    });

    return {
      exportedAt: new Date().toISOString(),
      formatVersion: 1,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.profile?.firstName ?? undefined,
        lastName: user.profile?.lastName ?? undefined,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt.toISOString(),
      },
      memberships: memberships.map((m) => ({
        householdId: m.householdId,
        householdName: m.household.name,
        role: m.role,
        status: m.status,
        joinedAt: m.createdAt.toISOString(),
      })),
      workspaces,
      facts: facts.map((fact) => ({ ...fact, amount: fact.amount.toString() })),
      documents: documents.map((doc) => ({ ...doc, fileSize: doc.fileSize ?? undefined })),
      filingRecords,
      auditEvents,
      sessions: sessions.map((session) => ({
        id: session.id,
        createdAt: session.createdAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        revokedAt: session.revokedAt ? session.revokedAt.toISOString() : undefined,
        ipAddress: session.ipAddress ?? undefined,
        userAgent: session.userAgent ?? undefined,
      })),
    };
  }

  /**
   * Erase an account.
   *
   * Refused while the user is the last PRIMARY_FILER of a household that still
   * has other active members: erasing them would leave the co-filer with a
   * household they cannot administer and a return they cannot file. That is an
   * ownership transfer, not a deletion.
   *
   * Otherwise the identity is anonymised in place (so the audit trail keeps
   * pointing at a row that no longer identifies anyone), credentials are
   * destroyed, sessions and push registrations are deleted, and a household this
   * user was alone in is renamed so the name does not outlive the account.
   *
   * The household and its workspaces are *kept*. That is not an oversight: the
   * append-only trigger on `audit_events` rejects the UPDATE that a cascade would
   * need to null `householdId`, so a household that has any audit history cannot
   * be deleted at all (the same migration documents this). The financial record
   * and the trail behind it are therefore retained, anonymous, which is also what
   * tax-record retention requires.
   */
  async eraseAccount(userId: string, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: { include: { household: { include: { members: true } } } } },
    });
    if (!user) throw new NotFoundException('User not found');

    const blocking = user.memberships.filter((membership) => {
      if (membership.role !== 'PRIMARY_FILER') return false;
      const others = membership.household.members.filter(
        (member) => member.userId !== userId && member.status === 'ACTIVE',
      );
      return others.length > 0;
    });

    if (blocking.length > 0) {
      throw new ConflictException(
        'Transfer ownership of the household before erasing the account: it still has other active members.',
      );
    }

    const soleHouseholdIds = user.memberships
      .filter(
        (membership) =>
          membership.household.members.filter((member) => member.userId !== userId).length === 0,
      )
      .map((membership) => membership.householdId);

    const anonymisedEmail = `deleted-${user.id}@deleted.invalid`;

    await this.prisma.$transaction([
      // Personal identifiers and credentials.
      this.prisma.user.update({
        where: { id: userId },
        data: {
          email: anonymisedEmail,
          passwordHash: crypto.randomBytes(32).toString('hex'),
          isActive: false,
          isEmailVerified: false,
          emailVerificationTokenHash: null,
          emailVerificationExpiresAt: null,
          mfaEnabled: false,
          mfaSecret: null,
          mfaRecoveryCodes: [],
          // Any token minted before this point stops verifying.
          tokenVersion: { increment: 1 },
        },
      }),
      // The profile carries the name; blank it rather than deleting the row so
      // the user row keeps its shape.
      this.prisma.personProfile.updateMany({
        where: { userId },
        data: { firstName: null, lastName: null },
      }),
      this.prisma.session.deleteMany({ where: { userId } }),
      this.prisma.pushDevice.deleteMany({ where: { userId } }),
      // Pending invitations this user sent die with the account: the address is
      // no longer reachable and the inviter no longer exists.
      this.prisma.householdInvitation.deleteMany({
        where: { invitedById: userId, acceptedAt: null, revokedAt: null },
      }),
      this.prisma.householdMembership.deleteMany({ where: { userId } }),
      // A household cannot be deleted once it has audit history (the append-only
      // trigger rejects the cascade's UPDATE). Its name, however, is personal
      // data, so a household this user was alone in is renamed.
      this.prisma.household.updateMany({
        where: { id: { in: soleHouseholdIds }, createdById: userId },
        data: { name: 'Deleted household' },
      }),
    ]);

    await this.auditService.log({
      actorId: userId,
      actorEmail: anonymisedEmail,
      eventType: AuditEventType.USER_ACCOUNT_ERASED,
      entityType: 'User',
      entityId: userId,
      description: 'Account erased at the user request; identity anonymised',
      ipAddress,
    });

    return {
      erased: true,
      anonymisedEmail,
      householdsAnonymised: soleHouseholdIds.length,
      // Stated explicitly so a caller is not surprised that the financial record
      // survives: the audit trail behind it is append-only by design.
      recordsRetained: true,
    };
  }
}
