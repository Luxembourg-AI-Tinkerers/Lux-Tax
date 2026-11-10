import type { PushMessage, PushTransport } from './push.adapter';

/**
 * Expo Push Service transport — a real delivery path for the mobile app.
 *
 * The Expo SDK is what `apps/mobile` builds on, so its push endpoint is the
 * natural provider: no SDK is required, only an HTTPS POST of one JSON body per
 * batched message. Keeping it dependency-free means the outbox worker does not
 * pull a vendor SDK into the API.
 *
 * The transport is deliberately unaware of *where* a device token comes from:
 * `resolveTokens` supplies them. A user with no registered device yields an
 * empty list, and the outbox records the row as SKIPPED rather than retrying a
 * message that can never be delivered.
 */
export interface ExpoPushConfig {
  /** Defaults to the public Expo endpoint; overridable for tests and proxies. */
  endpoint?: string;
  /** Expo access token, when the project requires one. */
  accessToken?: string;
  /** Per-request timeout, in milliseconds. */
  timeoutMs?: number;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

/** One entry of the Expo push request body. */
interface ExpoPushTicket {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default';
  priority?: 'default' | 'normal' | 'high';
}

interface ExpoPushResponse {
  data?: Array<{ status?: string; id?: string; message?: string; details?: unknown }>;
  errors?: Array<{ code?: string; message?: string }>;
}

export class ExpoPushTransport implements PushTransport {
  readonly name = 'expo';

  constructor(
    private readonly resolveTokens: (userId: string) => Promise<string[]>,
    private readonly config: ExpoPushConfig = {},
  ) {}

  async send(message: PushMessage): Promise<string> {
    const tokens = await this.resolveTokens(message.userId);
    if (tokens.length === 0) {
      throw new Error('No registered push device for this user');
    }

    const tickets: ExpoPushTicket[] = tokens.map((token) => ({
      to: token,
      title: message.title,
      body: message.body,
      // Carries the correlation id to the app without putting it in the body.
      data: { notificationId: message.notificationId },
      sound: 'default',
      priority: 'default',
    }));

    const fetchImpl = this.config.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 15_000);

    try {
      const response = await fetchImpl(this.config.endpoint ?? 'https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(this.config.accessToken
            ? { authorization: `Bearer ${this.config.accessToken}` }
            : {}),
        },
        body: JSON.stringify(tickets),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(
          `Expo push HTTP ${response.status}: ${text.slice(0, 200) || response.statusText}`,
        );
      }

      const payload = (await response.json()) as ExpoPushResponse;
      const failures = (payload.data ?? []).filter((ticket) => ticket.status === 'error');
      if (failures.length === tokens.length) {
        throw new Error(
          `Expo push rejected every ticket: ${failures
            .map((ticket) => ticket.message ?? ticket.details ?? 'unknown')
            .join('; ')
            .slice(0, 300)}`,
        );
      }

      const accepted = (payload.data ?? []).filter((ticket) => ticket.status !== 'error');
      const ids = accepted.map((ticket) => ticket.id).filter(Boolean);
      return `expo:${ids.length ? ids.join(',') : message.notificationId}`;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** True when the value looks like an Expo push token. */
export function isExpoPushToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token) || /^[A-Za-z0-9_-]{20,}$/.test(token);
}
