import { randomUUID } from 'crypto';
import * as net from 'net';
import * as tls from 'tls';
import type { EmailMessage, EmailTransport } from './email.adapter';

/**
 * A real SMTP transport: no SDK, no dependency, just the protocol.
 *
 * It exists so that turning e-mail delivery on is a configuration change
 * (`SMTP_HOST`, …) rather than a code change, and so the transport can be
 * exercised end to end against an in-process SMTP server instead of being taken
 * on trust. Implicit TLS (465), STARTTLS (587) and AUTH PLAIN / LOGIN are
 * supported.
 */
export interface SmtpConfig {
  host: string;
  port: number;
  /** Implicit TLS from the first byte (port 465). */
  secure?: boolean;
  /** Issue STARTTLS on a plaintext connection (port 587). */
  starttls?: boolean;
  /** Refuse to send credentials over a plaintext connection. */
  requireTls?: boolean;
  user?: string;
  pass?: string;
  /** Envelope sender. Defaults to the authenticated user. */
  from?: string;
  /** Per-command socket timeout, in milliseconds. */
  timeoutMs?: number;
  /** Value for the EHLO greeting. */
  clientName?: string;
}

export interface SmtpReply {
  code: number;
  lines: string[];
}

const CRLF = '\r\n';

/**
 * Build the RFC 5322 message. The body is base64 UTF-8: it survives any
 * transfer path, needs no quoted-printable escaping and cannot be mangled by a
 * line-length limit. The subject is RFC 2047 encoded only when it must be.
 */
export function buildSmtpMessage(
  message: EmailMessage,
  from: string,
  messageId: string,
  date: Date = new Date(),
): string {
  const printable = /^[\x20-\x7e]*$/.test(message.subject);
  const subject = printable
    ? message.subject
    : `=?UTF-8?B?${Buffer.from(message.subject, 'utf8').toString('base64')}?=`;

  const headers = [
    `From: ${from}`,
    `To: ${message.to}`,
    `Subject: ${subject}`,
    `Date: ${date.toUTCString()}`,
    `Message-ID: <${messageId}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    // Correlates the delivered message with the in-app notification row without
    // putting the id in the visible body.
    `X-LuxTax-Notification-Id: ${message.notificationId}`,
  ];

  const body = Buffer.from(message.text, 'utf8')
    .toString('base64')
    // 76-character lines keep the message inside the SMTP line limit.
    .replace(/(.{76})/g, `$1${CRLF}`);

  return `${headers.join(CRLF)}${CRLF}${CRLF}${body}${CRLF}`;
}

/**
 * Dot-stuffing (RFC 5321 §4.5.2): a line starting with "." gets a second one,
 * otherwise the server reads it as the end-of-data marker.
 */
export function dotStuff(payload: string): string {
  return payload
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join(CRLF);
}

/**
 * Sequential reply reader. Every `reply()` call resolves with one complete
 * SMTP reply, folding continuation lines ("250-" … "250 ").
 */
class SmtpSession {
  private buffer = '';
  private pending: ((reply: SmtpReply) => void) | null = null;
  private failure: Error | null = null;
  private closed = false;

  constructor(
    private socket: net.Socket,
    private readonly timeoutMs: number,
  ) {
    this.listen(this.socket);
  }

  private listen(socket: net.Socket): void {
    this.socket = socket;
    socket.setTimeout(this.timeoutMs);
    socket.on('data', (chunk) => {
      this.buffer += chunk.toString('utf8');
      this.drain();
    });
    socket.on('timeout', () =>
      this.fail(new Error(`SMTP timeout after ${this.timeoutMs} ms`)),
    );
    socket.on('error', (error: Error) => this.fail(error));
    socket.on('close', () => {
      // Only an error if somebody was still waiting for a reply.
      if (this.pending) this.fail(new Error('SMTP connection closed unexpectedly'));
      this.closed = true;
    });
  }

  private fail(error: Error): void {
    this.failure = error;
    const pending = this.pending;
    this.pending = null;
    if (pending) pending({ code: 0, lines: [error.message] });
  }

  private drain(): void {
    if (!this.pending) return;
    const reply = this.takeReply();
    if (!reply) return;
    const resolve = this.pending;
    this.pending = null;
    resolve(reply);
  }

  /** Parse one reply from the buffer, or return null when it is incomplete. */
  private takeReply(): SmtpReply | null {
    const lines: string[] = [];
    let cursor = 0;
    for (;;) {
      const index = this.buffer.indexOf(CRLF, cursor);
      if (index === -1) return null;
      const line = this.buffer.slice(cursor, index);
      const match = /^(\d{3})([- ])(.*)$/.exec(line);
      if (!match) {
        this.failure = new Error(`Malformed SMTP reply: ${line.slice(0, 120)}`);
        return { code: 0, lines: [line] };
      }
      lines.push(match[3]);
      cursor = index + CRLF.length;
      if (match[2] === ' ') {
        this.buffer = this.buffer.slice(cursor);
        return { code: Number(match[1]), lines };
      }
    }
  }

  reply(): Promise<SmtpReply> {
    if (this.failure) return Promise.reject(this.failure);
    if (this.closed && !this.buffer.includes(CRLF)) {
      return Promise.reject(new Error('SMTP connection closed'));
    }
    return new Promise<SmtpReply>((resolve, reject) => {
      this.pending = (r) => {
        if (r.code === 0) reject(new Error(r.lines[0]));
        else resolve(r);
      };
      this.drain();
    });
  }

  async command(line: string, expect: number[] = []): Promise<SmtpReply> {
    this.socket.write(`${line}${CRLF}`);
    const reply = await this.reply();
    if (expect.length && !expect.includes(reply.code)) {
      throw new Error(
        `SMTP ${reply.code} for "${line.split(' ')[0]}": ${reply.lines.join(' ').slice(0, 300)}`,
      );
    }
    return reply;
  }

  /** Send DATA contents including the terminating "." line. */
  async data(payload: string): Promise<SmtpReply> {
    this.socket.write(payload.endsWith(CRLF) ? payload : `${payload}${CRLF}`);
    this.socket.write(`.${CRLF}`);
    return this.reply();
  }

  upgrade(host: string): void {
    const plain = this.socket;
    plain.removeAllListeners();
    plain.setTimeout(0);
    const secure = tls.connect({ socket: plain, servername: host });
    this.listen(secure);
  }

  destroy(): void {
    this.closed = true;
    this.socket.removeAllListeners();
    this.socket.destroy();
  }
}

export class SmtpEmailTransport implements EmailTransport {
  readonly name = 'smtp';

  constructor(private readonly config: SmtpConfig) {}

  async send(message: EmailMessage): Promise<string> {
    const from = this.config.from ?? this.config.user;
    if (!from) {
      throw new Error('SMTP sender is not configured (SMTP_FROM or SMTP_USER)');
    }
    if (!message.to.includes('@')) {
      throw new Error(`Refusing to send to a non-address recipient: ${message.to}`);
    }

    const messageId = `${randomUUID()}@luxtax.local`;
    const payload = dotStuff(buildSmtpMessage(message, from, messageId));

    const {
      host,
      port,
      secure = false,
      starttls = false,
      requireTls = false,
      user,
      pass,
      timeoutMs = 20_000,
      clientName = 'luxtax.local',
    } = this.config;

    const socket: net.Socket = secure
      ? tls.connect({ host, port, servername: host })
      : net.connect({ host, port });
    const session = new SmtpSession(socket, timeoutMs);

    try {
      await session.reply(); // 220 greeting
      let ehlo = await session.command(`EHLO ${clientName}`, [250]);

      if (!secure && starttls) {
        const offers = ehlo.lines.join(' ').toUpperCase();
        if (!offers.includes('STARTTLS')) {
          throw new Error('SMTP server does not offer STARTTLS but it was required');
        }
        await session.command('STARTTLS', [220]);
        session.upgrade(host);
        ehlo = await session.command(`EHLO ${clientName}`, [250]);
      }

      if (!secure && !starttls && requireTls) {
        throw new Error('SMTP connection is plaintext and TLS is required');
      }

      if (user && pass) {
        const offers = ehlo.lines.join(' ').toUpperCase();
        if (offers.includes('AUTH PLAIN')) {
          const token = Buffer.from(`\0${user}\0${pass}`, 'utf8').toString('base64');
          await session.command(`AUTH PLAIN ${token}`, [235]);
        } else if (offers.includes('AUTH LOGIN') || offers.includes('AUTH')) {
          await session.command('AUTH LOGIN', [334]);
          await session.command(Buffer.from(user, 'utf8').toString('base64'), [334]);
          await session.command(Buffer.from(pass, 'utf8').toString('base64'), [235]);
        } else {
          throw new Error('SMTP server offers no AUTH mechanism');
        }
      }

      await session.command(`MAIL FROM:<${from}>`, [250]);
      await session.command(`RCPT TO:<${message.to}>`, [250, 251]);
      await session.command('DATA', [354]);
      const stored = await session.data(payload);
      if (stored.code !== 250) {
        throw new Error(
          `SMTP ${stored.code} after DATA: ${stored.lines.join(' ').slice(0, 300)}`,
        );
      }

      // Best effort: the message is already accepted, a failed QUIT must not
      // turn a delivered mail into a retried one.
      try {
        await session.command('QUIT', [221]);
      } catch {
        /* the server may drop the connection instead of answering */
      }

      const receipt = stored.lines.join(' ').trim();
      return `smtp:${receipt || messageId}`;
    } finally {
      session.destroy();
    }
  }
}

/** Build the transport from the environment, or `null` when SMTP is unset. */
export function smtpTransportFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SmtpEmailTransport | null {
  const host = env.SMTP_HOST;
  if (!host) return null;
  const fallback = env.SMTP_SECURE === 'true' ? 465 : 587;
  const port = Number(env.SMTP_PORT ?? fallback);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`SMTP_PORT is not a valid port: ${env.SMTP_PORT}`);
  }
  return new SmtpEmailTransport({
    host,
    port,
    secure: env.SMTP_SECURE === 'true',
    starttls: env.SMTP_STARTTLS !== 'false',
    requireTls: env.SMTP_REQUIRE_TLS === 'true',
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM,
    timeoutMs: Number(env.SMTP_TIMEOUT_MS ?? 20_000),
  });
}
