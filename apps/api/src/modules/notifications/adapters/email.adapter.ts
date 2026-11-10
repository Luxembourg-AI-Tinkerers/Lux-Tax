import { appendFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import type { DeliveryAdapter, DeliveryPayload } from './delivery-adapter';
import { smtpTransportFromEnv } from './smtp-email.transport';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  notificationId: string;
}

export interface EmailTransport {
  readonly name: string;
  /** Returns a provider receipt id. */
  send(message: EmailMessage): Promise<string>;
}

/**
 * Local file sink. It is a real transport (the message is serialised and
 * persisted, and the outbox marks it SENT), but nothing leaves the machine.
 * Swapping in SMTP / SES / Postmark means implementing `EmailTransport` and
 * calling `useTransport()` once — the outbox and retry logic stay unchanged.
 */
export class LocalSinkEmailTransport implements EmailTransport {
  readonly name = 'local-sink';

  constructor(
    private readonly sinkPath: string = process.env.NOTIFICATION_EMAIL_SINK ??
      join(process.cwd(), 'tmp', 'notifications', 'email.jsonl'),
  ) {}

  async send(message: EmailMessage): Promise<string> {
    await mkdir(dirname(this.sinkPath), { recursive: true });
    const line = JSON.stringify({
      channel: 'EMAIL',
      to: message.to,
      subject: message.subject,
      text: message.text,
      notificationId: message.notificationId,
      sentAt: new Date().toISOString(),
    });
    await appendFile(this.sinkPath, `${line}\n`, 'utf8');
    return `local:${message.notificationId}`;
  }
}

export class EmailAdapter implements DeliveryAdapter {
  readonly channel = 'EMAIL' as const;

  /**
   * A configured SMTP relay wins; otherwise the local sink keeps the outbox
   * working end to end without sending anything off the machine.
   */
  private transport: EmailTransport =
    smtpTransportFromEnv() ?? new LocalSinkEmailTransport();

  get transportName(): string {
    return this.transport.name;
  }

  /** Injection point for a real provider (and for tests). */
  useTransport(transport: EmailTransport): this {
    this.transport = transport;
    return this;
  }

  isConfigured(): boolean {
    return this.transport.name.length > 0;
  }

  async send(payload: DeliveryPayload): Promise<string> {
    if (!payload.email) {
      throw new Error('Recipient has no e-mail address');
    }
    return this.transport.send({
      to: payload.email,
      subject: payload.title,
      text: payload.body,
      notificationId: payload.notificationId,
    });
  }
}
