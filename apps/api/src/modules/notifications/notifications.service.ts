import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  HouseholdRole,
  MembershipStatus,
  NotificationDto,
  NotificationListDto,
  NotificationPreferenceDto,
  NotificationSeverity,
  NotificationType,
  UpdateNotificationPreferencesDto,
} from '@luxtax/contracts';
import {
  defaultNotificationPreference,
  shouldDeliverNotification,
} from './notification-rules';

/** Rows older than this are never returned in a single page. */
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;

interface NotificationRow {
  id: string;
  householdId: string;
  workspaceId: string | null;
  userId: string;
  actorId: string | null;
  type: string;
  severity: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  actionUrl: string | null;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
}

interface PreferenceRow {
  id: string;
  userId: string;
  householdId: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
  mutedTypes: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateNotificationParams {
  householdId: string;
  /**
   * Optional idempotency key. A second emission with the same key for the same
   * user returns the existing row instead of writing a duplicate (regenerating a
   * package or approving again must not multiply the inbox).
   */
  dedupeKey?: string | null;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  workspaceId?: string | null;
  actorId?: string | null;
  severity?: NotificationSeverity;
  entityType?: string | null;
  entityId?: string | null;
  actionUrl?: string | null;
}

export interface EmitToHouseholdParams
  extends Omit<CreateNotificationParams, 'userId'> {
  /** Usually the actor: they already know what they just did. */
  excludeUserIds?: string[];
  /** Restrict recipients to these roles (e.g. only filers can approve). */
  roles?: HouseholdRole[];
}

export interface ListNotificationsOptions {
  unreadOnly?: boolean;
  limit?: number;
}

function toNotificationDto(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    householdId: row.householdId,
    workspaceId: row.workspaceId,
    userId: row.userId,
    actorId: row.actorId,
    type: row.type as NotificationType,
    severity: row.severity as NotificationSeverity,
    title: row.title,
    body: row.body,
    entityType: row.entityType,
    entityId: row.entityId,
    actionUrl: row.actionUrl,
    isRead: row.isRead,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toPreferenceDto(row: PreferenceRow): NotificationPreferenceDto {
  return {
    id: row.id,
    userId: row.userId,
    householdId: row.householdId,
    emailEnabled: row.emailEnabled,
    pushEnabled: row.pushEnabled,
    mutedTypes: row.mutedTypes as NotificationType[],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persist one notification for one user, bypassing preferences. Used for
   * notices that must not be muted (security) and by `emitToHousehold` after
   * its own preference filter.
   */
  async createForUser(
    params: CreateNotificationParams,
  ): Promise<NotificationDto> {
    if (params.dedupeKey) {
      const existing = await this.prisma.notification.findFirst({
        where: { userId: params.userId, dedupeKey: params.dedupeKey },
      });
      if (existing) return toNotificationDto(existing as NotificationRow);
    }

    try {
      const notification = await this.prisma.notification.create({
        data: {
          householdId: params.householdId,
          workspaceId: params.workspaceId ?? null,
          userId: params.userId,
          dedupeKey: params.dedupeKey ?? null,
          actorId: params.actorId ?? null,
          type: params.type,
          severity: params.severity ?? NotificationSeverity.INFO,
          title: params.title,
          body: params.body,
          entityType: params.entityType ?? null,
          entityId: params.entityId ?? null,
          actionUrl: params.actionUrl ?? null,
        },
      });

      return toNotificationDto(notification as NotificationRow);
    } catch (error) {
      // The pre-check above cannot close the race between two concurrent
      // emissions: the loser hits the unique (userId, dedupeKey) index. Return
      // the row the winner wrote instead of failing the caller's operation.
      const uniqueViolation = (error as { code?: string } | null)?.code === 'P2002';
      if (params.dedupeKey && uniqueViolation) {
        const existing = await this.prisma.notification.findFirst({
          where: { userId: params.userId, dedupeKey: params.dedupeKey },
        });
        if (existing) return toNotificationDto(existing as NotificationRow);
      }
      throw error;
    }
  }

  /**
   * Fan out an ordinary notification to the household's ACTIVE members,
   * skipping the actor and anyone who muted this type. Returns the number of
   * rows written; a household where everyone muted the type writes none.
   */
  async emitToHousehold(params: EmitToHouseholdParams): Promise<number> {
    const excluded = new Set(params.excludeUserIds ?? []);

    const members = await this.prisma.householdMembership.findMany({
      where: {
        householdId: params.householdId,
        status: MembershipStatus.ACTIVE,
        ...(params.roles && params.roles.length > 0 ? { role: { in: params.roles } } : {}),
      },
      select: { userId: true },
    });

    const recipients = members
      .map((member) => member.userId)
      .filter((userId) => !excluded.has(userId));

    if (recipients.length === 0) return 0;

    const preferences = await this.prisma.notificationPreference.findMany({
      where: {
        householdId: params.householdId,
        userId: { in: recipients },
      },
      select: { userId: true, mutedTypes: true },
    });
    const mutedTypesByUser = new Map<string, string[]>(
      preferences.map(
        (pref): [string, string[]] => [
          pref.userId,
          pref.mutedTypes as string[],
        ],
      ),
    );

    const deliverable = recipients.filter((userId) => {
      const mutedTypes = mutedTypesByUser.get(userId);
      return shouldDeliverNotification(
        mutedTypes ? { mutedTypes } : null,
        params.type,
      );
    });

    if (deliverable.length === 0) return 0;

    await this.prisma.notification.createMany({
      skipDuplicates: true,
      data: deliverable.map((userId) => ({
        householdId: params.householdId,
        workspaceId: params.workspaceId ?? null,
        userId,
        dedupeKey: params.dedupeKey ?? null,
        actorId: params.actorId ?? null,
        type: params.type,
        severity: params.severity ?? NotificationSeverity.INFO,
        title: params.title,
        body: params.body,
        entityType: params.entityType ?? null,
        entityId: params.entityId ?? null,
        actionUrl: params.actionUrl ?? null,
      })),
    });

    return deliverable.length;
  }

  async list(
    workspaceId: string,
    userId: string,
    options: ListNotificationsOptions = {},
  ): Promise<NotificationListDto> {
    const workspace = await this.prisma.taxYearWorkspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, householdId: true },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    // Household-level rows (written without a workspace) belong to every
    // workspace of that household; without this branch they could never be read
    // or marked, which is exactly what a security notice must not be.
    const scope = {
      userId,
      OR: [
        { workspaceId },
        { workspaceId: null, householdId: workspace.householdId },
      ],
    };

    const take = Math.min(
      Math.max(options.limit ?? DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE,
    );

    const [items, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: {
          ...scope,
          ...(options.unreadOnly ? { isRead: false } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.notification.count({
        where: { ...scope, isRead: false },
      }),
    ]);

    return {
      items: items.map((item) => toNotificationDto(item as NotificationRow)),
      unreadCount,
    };
  }

  async unreadCount(workspaceId: string, userId: string): Promise<number> {
    const workspace = await this.prisma.taxYearWorkspace.findUnique({
      where: { id: workspaceId },
      select: { householdId: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    return this.prisma.notification.count({
      where: {
        userId,
        isRead: false,
        OR: [
          { workspaceId },
          { workspaceId: null, householdId: workspace.householdId },
        ],
      },
    });
  }

  async markRead(
    workspaceId: string,
    notificationId: string,
    userId: string,
  ): Promise<{ success: boolean }> {
    const workspace = await this.prisma.taxYearWorkspace.findUnique({
      where: { id: workspaceId },
      select: { householdId: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const result = await this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        userId,
        OR: [
          { workspaceId },
          { workspaceId: null, householdId: workspace.householdId },
        ],
      },
      data: { isRead: true, readAt: new Date() },
    });

    if (result.count === 0) {
      // Never distinguish "belongs to someone else" from "does not exist":
      // both are 404, so a guessed id leaks nothing.
      throw new NotFoundException('Notification not found');
    }

    return { success: true };
  }

  async markAllRead(
    workspaceId: string,
    userId: string,
  ): Promise<{ updated: number }> {
    const workspace = await this.prisma.taxYearWorkspace.findUnique({
      where: { id: workspaceId },
      select: { householdId: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
        OR: [
          { workspaceId },
          { workspaceId: null, householdId: workspace.householdId },
        ],
      },
      data: { isRead: true, readAt: new Date() },
    });

    return { updated: result.count };
  }

  async getPreferences(
    householdId: string,
    userId: string,
  ): Promise<NotificationPreferenceDto> {
    const preference = await this.prisma.notificationPreference.findUnique({
      where: { userId_householdId: { userId, householdId } },
    });

    return preference
      ? toPreferenceDto(preference as PreferenceRow)
      : defaultNotificationPreference(householdId, userId);
  }

  async updatePreferences(
    householdId: string,
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferenceDto> {
    const update: {
      emailEnabled?: boolean;
      pushEnabled?: boolean;
      mutedTypes?: NotificationType[];
    } = {};
    if (dto.emailEnabled !== undefined) update.emailEnabled = dto.emailEnabled;
    if (dto.pushEnabled !== undefined) update.pushEnabled = dto.pushEnabled;
    if (dto.mutedTypes !== undefined) {
      // A security alert is never muteable: a compromised session must not be
      // able to silence the notice that reports it.
      update.mutedTypes = dto.mutedTypes.filter(
        (type) => type !== NotificationType.SECURITY_ALERT,
      );
    }

    const preference = await this.prisma.notificationPreference.upsert({
      where: { userId_householdId: { userId, householdId } },
      create: {
        userId,
        householdId,
        emailEnabled: dto.emailEnabled ?? true,
        pushEnabled: dto.pushEnabled ?? true,
        mutedTypes: (dto.mutedTypes ?? []).filter(
          (type) => type !== NotificationType.SECURITY_ALERT,
        ),
      },
      update,
    });

    return toPreferenceDto(preference as PreferenceRow);
  }
}
