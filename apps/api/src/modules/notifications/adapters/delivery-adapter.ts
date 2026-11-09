import type { DeliveryChannel } from '../notification-delivery';

/** What an adapter is allowed to see. Never an amount, field key or document. */
export interface DeliveryPayload {
  notificationId: string;
  userId: string;
  /** Recipient address for e-mail; null when the account has none. */
  email: string | null;
  type: string;
  severity: string;
  title: string;
  body: string;
}

export interface DeliveryAdapter {
  readonly channel: DeliveryChannel;
  /** Human-readable transport name, stored nowhere but useful in logs. */
  readonly transportName: string;
  /** False when no transport is configured; the worker marks the row SKIPPED. */
  isConfigured(): boolean;
  /** Returns a receipt id. Throwing marks the attempt failed and schedules a retry. */
  send(payload: DeliveryPayload): Promise<string>;
}
