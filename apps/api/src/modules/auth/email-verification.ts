/**
 * E-mail ownership proof.
 *
 * Before this existed, `isEmailVerified` was a column nobody ever wrote, so an
 * address was whatever a caller typed into the registration form. Two controls
 * depended on that being true: the platform-admin allowlist (which matches on
 * the address) and invitation acceptance (which matches on the invited
 * address). Both were therefore self-asserted.
 *
 * The token is random, stored only as a SHA-256 hash, single-use and expiring.
 */
import * as crypto from 'crypto';
import { EmailAdapter } from '../notifications/adapters/email.adapter';
import { smtpTransportFromEnv } from '../notifications/adapters/smtp-email.transport';
import { LocalSinkEmailTransport } from '../notifications/adapters/email.adapter';

export const VERIFICATION_TTL_HOURS = 24;

export interface IssuedVerification {
  /** The raw token — goes in the e-mail, never in the database. */
  token: string;
  hash: string;
  expiresAt: Date;
}

export function issueVerificationToken(now: Date = new Date()): IssuedVerification {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(now.getTime() + VERIFICATION_TTL_HOURS * 60 * 60 * 1000);
  return { token, hash: hashCode(token), expiresAt };
}

export function hashCode(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Where the user clicks. The web app owns the page; the API only carries the token. */
export function verificationLink(token: string, env: NodeJS.ProcessEnv = process.env): string {
  const base = (env.FRONTEND_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}/verify-email?token=${encodeURIComponent(token)}`;
}

export function verificationEmailBody(token: string, env: NodeJS.ProcessEnv = process.env): string {
  return [
    'Confirm your e-mail address to finish setting up your Luxembourg tax workspace.',
    '',
    verificationLink(token, env),
    '',
    `The link expires in ${VERIFICATION_TTL_HOURS} hours and can be used once.`,
    'If you did not create this account, ignore this message.',
  ].join('\n');
}

/**
 * Send the verification message through the configured transport: SMTP when
 * `SMTP_HOST` is set, otherwise the local JSONL sink (which is what the tests
 * read). Sending never throws into the caller's request — a mail outage must not
 * make registration fail — but it is logged.
 */
export async function sendVerificationEmail(
  to: string,
  token: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  try {
    const transport = smtpTransportFromEnv(env) ?? new LocalSinkEmailTransport();
    await transport.send({
      to,
      subject: 'Confirm your e-mail address',
      text: verificationEmailBody(token, env),
      notificationId: `verify:${hashCode(token).slice(0, 12)}`,
    });
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      `Verification e-mail to ${to} could not be sent: ${error instanceof Error ? error.message : 'unknown'}`,
    );
    return false;
  }
}

/** Kept for symmetry with the adapter: one instance is enough per process. */
export const verificationEmailAdapter = new EmailAdapter();
