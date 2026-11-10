import * as fs from 'fs';
import * as path from 'path';

/**
 * E-mail verification for e2e runs.
 *
 * Invitation acceptance and platform administration now require a verified
 * address, so a suite that registers a user and then invites them has to walk
 * the verification step it used to skip. The verification mail is written by the
 * local sink transport (the e2e environment sets no SMTP_HOST), so the token is
 * read back from the JSONL file the transport appends to.
 */

const SINK = path.join(process.cwd(), 'tmp', 'notifications', 'email.jsonl');

/** The most recent verification token sent to an address, or null. */
export function latestVerificationToken(email: string): string | null {
  if (!fs.existsSync(SINK)) return null;

  const target = email.trim().toLowerCase();
  const lines = fs.readFileSync(SINK, 'utf8').split('\n').filter(Boolean);

  // Walk backwards: the newest mail wins.
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    let entry: { to?: string; text?: string } | null = null;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (!entry?.to || entry.to.trim().toLowerCase() !== target) continue;
    const match = /token=([a-f0-9]{32,})/i.exec(entry.text ?? '');
    if (match) return match[1];
  }
  return null;
}

/**
 * Verify an account through the public endpoint, exactly as a user clicking the
 * link would. Returns the status code so a caller can assert on it.
 */
export async function verifyEmailFor(
  app: { inject: (opts: any) => Promise<{ statusCode: number }> },
  email: string,
): Promise<number> {
  const token = latestVerificationToken(email);
  if (!token) {
    throw new Error(`No verification e-mail was sent to ${email}`);
  }
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/verify-email',
    payload: { token },
  });
  return res.statusCode;
}
