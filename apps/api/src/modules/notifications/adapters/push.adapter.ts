import { appendFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import type { DeliveryAdapter, DeliveryPayload } from './delivery-adapter';

export interface PushMessage {
  userId: string;
  title: string;
  body: string;
  notificationId: string;
}

export interface PushTransport {
  readonly name: string;
  send(message: PushMessage): Promise<string>;
}

/**
 * Local file sink for push payloads. A real push provider needs a device token,
 * which this app does not collect yet, so the adapter is **not configured** by
 * default and the outbox records those rows as SKIPPED with a clear reason.
 * Setting NOTIFICATION_PUSH_ENABLED=true with a transport wired in is the only
 * change needed to turn it on.
 */
export class LocalSinkPushTransport implements PushTransport {
  readonly name = 'local-sink';

  constructor(
    private readonly sinkPath: string = process.env.NOTIFICATION_PUSH_SINK ??
      join(process.cwd(), 'tmp', 'notifications', 'push.jsonl'),
  ) {}

  async send(message: PushMessage): Promise<string> {
    await mkdir(dirname(this.sinkPath), { recursive: true });
    await appendFile(
      this.sinkPath,
      `${JSON.stringify({
        channel: 'PUSH',
        userId: message.userId,
        title: message.title,
        body: message.body,
        notificationId: message.notificationId,
        sentAt: new Date().toISOString(),
      })}\n`,
      'utf8',
    );
    return `local:${message.notificationId}`;
  }
}

export class PushAdapter implements DeliveryAdapter {
  readonly channel = 'PUSH' as const;

  private transport: PushTransport | null =
    process.env.NOTIFICATION_PUSH_ENABLED === 'true' ? new LocalSinkPushTransport() : null;

  get transportName(): string {
    return this.transport?.name ?? 'none';
  }

  /** Injection point for a real provider (and for tests). */
  useTransport(transport: PushTransport): this {
    this.transport = transport;
    return this;
  }

  isConfigured(): boolean {
    return this.transport !== null;
  }

  async send(payload: DeliveryPayload): Promise<string> {
    if (!this.transport) {
      throw new Error('No push transport configured (NOTIFICATION_PUSH_ENABLED is not true)');
    }
    return this.transport.send({
      userId: payload.userId,
      title: payload.title,
      body: payload.body,
      notificationId: payload.notificationId,
    });
  }
}
