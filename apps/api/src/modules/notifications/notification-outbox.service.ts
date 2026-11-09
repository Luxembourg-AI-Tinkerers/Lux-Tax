import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { DeliveryAdapter } from './adapters/delivery-adapter';
import { EmailAdapter } from './adapters/email.adapter';
import { PushAdapter } from './adapters/push.adapter';
import {
  runOutboxPass,
  type OutboxDeliveryRow,
  type OutboxRunResult,
  type OutboxStore,
} from './notification-outbox';

export type { OutboxRunResult } from './notification-outbox';

export interface OutboxStats {
  pending: number;
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * Transactional outbox worker.
 *
 * Notifications are written in-app first; delivery rows are enqueued beside
 * them. The worker claims due rows (PENDING → SENDING) so two instances cannot
 * send the same row, calls the channel adapter, and reschedules failures with
 * exponential backoff until the attempt budget is spent.
 *
 * The interval is off unless NOTIFICATION_OUTBOX_ENABLED=true, so a test or a
 * CLI process never starts sending on its own. `dispatchDue()` is public and
 * idempotent, which is what a real cron / queue consumer would call.
 */
@Injectable()
export class NotificationOutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationOutboxService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailAdapter,
    private readonly push: PushAdapter,
  ) {}

  onModuleInit(): void {
    if (process.env.NOTIFICATION_OUTBOX_ENABLED !== 'true') return;

    const configured = Number(process.env.NOTIFICATION_OUTBOX_INTERVAL_MS ?? 60_000);
    const interval =
      Number.isFinite(configured) && configured >= 5_000 ? configured : 60_000;

    this.timer = setInterval(() => {
      void this.dispatchDue();
    }, interval);
    // Never keep the process alive just for the poller.
    this.timer.unref?.();
    this.logger.log(`Notification outbox enabled, polling every ${interval} ms`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Create one PENDING delivery per channel; duplicates are ignored. */
  async enqueue(notificationId: string, channels: readonly string[]): Promise<number> {
    if (channels.length === 0) return 0;

    const result = await this.prisma.notificationDelivery.createMany({
      data: channels.map((channel) => ({ notificationId, channel })),
      skipDuplicates: true,
    });
    return result.count;
  }

  /** Prisma implementation of the pass's storage contract. */
  private get store(): OutboxStore {
    return {
      async findDue(limit: number, now: Date): Promise<OutboxDeliveryRow[]> {
        const rows = await this.prisma.notificationDelivery.findMany({
          where: { status: 'PENDING', nextAttemptAt: { lte: now } },
          orderBy: { nextAttemptAt: 'asc' },
          take: limit,
          include: { notification: { include: { user: { select: { email: true } } } } },
        });
        return rows as unknown as OutboxDeliveryRow[];
      },
      async claim(id: string): Promise<boolean> {
        const claimed = await this.prisma.notificationDelivery.updateMany({
          where: { id, status: 'PENDING' },
          data: { status: 'SENDING' },
        });
        return claimed.count > 0;
      },
      async markSent(id: string, sentAt: Date): Promise<void> {
        await this.prisma.notificationDelivery.update({
          where: { id },
          data: { status: 'SENT', sentAt, lastError: null },
        });
      },
      async markSkipped(id: string, reason: string): Promise<void> {
        await this.prisma.notificationDelivery.update({
          where: { id },
          data: { status: 'SKIPPED', lastError: reason.slice(0, 500) },
        });
      },
      async markRetry(id: string, attempts: number, error: string, next: Date): Promise<void> {
        await this.prisma.notificationDelivery.update({
          where: { id },
          data: { status: 'PENDING', attempts, lastError: error, nextAttemptAt: next },
        });
      },
      async markFailed(id: string, attempts: number, error: string): Promise<void> {
        await this.prisma.notificationDelivery.update({
          where: { id },
          data: { status: 'FAILED', attempts, lastError: error },
        });
      },
    };
  }

  /** Send every delivery whose scheduled time has passed. */
  async dispatchDue(limit = 25): Promise<OutboxRunResult> {
    const empty: OutboxRunResult = { scanned: 0, sent: 0, retried: 0, failed: 0, skipped: 0 };
    if (this.running) return empty;

    this.running = true;
    try {
      const adapters: DeliveryAdapter[] = [this.email, this.push];
      return await runOutboxPass(this.store, adapters, limit);
    } catch (error) {
      // A failing poll must never crash the process; the next tick retries.
      this.logger.error(
        `Outbox dispatch failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return empty;
    } finally {
      this.running = false;
    }
  }

  /** Counts for the admin console / tests. */
  async stats(): Promise<OutboxStats> {
    const [pending, sent, failed, skipped] = await Promise.all([
      this.prisma.notificationDelivery.count({ where: { status: 'PENDING' } }),
      this.prisma.notificationDelivery.count({ where: { status: 'SENT' } }),
      this.prisma.notificationDelivery.count({ where: { status: 'FAILED' } }),
      this.prisma.notificationDelivery.count({ where: { status: 'SKIPPED' } }),
    ]);
    return { pending, sent, failed, skipped };
  }
}
