import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  NotificationSeverity,
  NotificationType,
} from '@luxtax/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { isWithinReminderWindow } from './notification-delivery';

/**
 * Deadline reminders — the "cron" half of the notification gap.
 *
 * It scans open assessments whose objection deadline is approaching and emits a
 * DEADLINE_REMINDER with a per-day dedupe key, so a restart or a second replica
 * cannot spam the household. Like the outbox, the timer is off by default and
 * enabled with NOTIFICATION_REMINDERS_ENABLED=true.
 */
@Injectable()
export class NotificationRemindersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationRemindersService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    if (process.env.NOTIFICATION_REMINDERS_ENABLED !== 'true') return;

    const configured = Number(process.env.NOTIFICATION_REMINDERS_INTERVAL_MS ?? 6 * 60 * 60_000);
    const interval =
      Number.isFinite(configured) && configured >= 60 * 60_000 ? configured : 6 * 60 * 60_000;

    this.timer = setInterval(() => {
      void this.sweep();
    }, interval);
    this.timer.unref?.();
    this.logger.log(`Deadline reminders enabled, scanning every ${interval} ms`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Emit one reminder per open assessment inside the window. */
  async sweep(now: Date = new Date()): Promise<{ reminded: number }> {
    const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60_000);

    const assessments = await this.prisma.assessment.findMany({
      where: {
        isFinal: false,
        objectionDeadline: { not: null, gte: now, lte: horizon },
      },
      select: {
        id: true,
        workspaceId: true,
        taxYear: true,
        objectionDeadline: true,
        workspace: { select: { householdId: true } },
      },
      take: 200,
    });

    let reminded = 0;
    for (const assessment of assessments) {
      if (!assessment.objectionDeadline) continue;
      if (!isWithinReminderWindow(assessment.objectionDeadline, now)) continue;

      const day = assessment.objectionDeadline.toISOString().slice(0, 10);
      try {
        reminded += await this.notifications.emitToHousehold({
          householdId: assessment.workspace.householdId,
          workspaceId: assessment.workspaceId,
          type: NotificationType.DEADLINE_REMINDER,
          severity: NotificationSeverity.WARNING,
          title: 'Objection deadline approaching',
          body: `The objection deadline for the ${assessment.taxYear} assessment is ${day}. Review the assessment with your adviser before the window closes.`,
          entityType: 'Assessment',
          entityId: assessment.id,
          dedupeKey: `objection-deadline:${assessment.id}:${day}`,
        });
      } catch (error) {
        this.logger.warn(
          `Deadline reminder skipped for ${assessment.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return { reminded };
  }
}
