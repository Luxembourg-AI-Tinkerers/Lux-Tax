import { Injectable, Logger } from '@nestjs/common';
import { OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PushAdapter } from './adapters/push.adapter';
import { ExpoPushTransport } from './adapters/expo-push.transport';
import {
  isValidPushToken,
  normalizePlatform,
  selectLiveTokens,
} from './notification-devices';

/**
 * The device registry behind push delivery.
 *
 * Without it the Expo transport would be unreachable code: the outbox asks the
 * adapter to send to a user, and the adapter needs that user's live tokens.
 * Tokens are per install, not per account, so one user can legitimately hold
 * several; a token is revoked (never deleted) so a returning device keeps a
 * history and a stale token cannot be silently reused by somebody else.
 */
@Injectable()
export class NotificationDevicesService implements OnModuleInit {
  private readonly logger = new Logger(NotificationDevicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushAdapter: PushAdapter,
  ) {}

  /**
   * Wire the Expo transport before anything can send. Doing it at init means a
   * registered device starts receiving pushes with no restart and no flag; with
   * no device registered the outbox still records PUSH rows as SKIPPED, so an
   * un-configured deployment behaves exactly as before.
   */
  onModuleInit(): void {
    this.enablePush();
  }

  /** Live tokens for a user, oldest first. Never throws: a lookup failure must
   *  not fail the notification, it only makes the push row SKIPPED. */
  async resolveTokens(userId: string): Promise<string[]> {
    try {
      const rows = await this.prisma.pushDevice.findMany({
        where: { userId, revokedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { token: true, createdAt: true, revokedAt: true },
      });
      return selectLiveTokens(rows);
    } catch (error) {
      this.logger.warn(
        `Push token lookup failed for ${userId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return [];
    }
  }

  /**
   * Register (or re-activate) an install. A token is unique across accounts: if
   * it was registered to another user — a shared device, a re-installed app —
   * it is moved to the caller rather than duplicated, so the previous owner
   * stops receiving that device's notifications.
   */
  async register(userId: string, token: string, platform: string): Promise<void> {
    if (!isValidPushToken(token)) {
      throw new Error('Not a push token');
    }
    const normalised = normalizePlatform(platform);
    if (!normalised) {
      throw new Error('Unsupported platform');
    }
    await this.prisma.pushDevice.upsert({
      where: { token },
      create: { userId, token, platform: normalised },
      update: { userId, platform: normalised, revokedAt: null },
    });
  }

  /** Revoke one install. Idempotent, and scoped to the caller. */
  async revoke(userId: string, token: string): Promise<void> {
    await this.prisma.pushDevice.updateMany({
      where: { userId, token, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revoke every install of a user (sign-out everywhere, lost device). */
  async revokeAll(userId: string): Promise<void> {
    await this.prisma.pushDevice.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Hand the adapter a resolver and the Expo transport. Called once at module
   * init, so push starts working as soon as a device registers — no code change
   * and no restart-with-a-flag.
   */
  enablePush(): void {
    this.pushAdapter.useTransport(
      new ExpoPushTransport((userId) => this.resolveTokens(userId), {
        accessToken: process.env.EXPO_ACCESS_TOKEN,
        endpoint: process.env.EXPO_PUSH_ENDPOINT,
      }),
    );
  }
}
