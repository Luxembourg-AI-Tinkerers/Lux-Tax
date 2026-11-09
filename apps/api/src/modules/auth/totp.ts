/**
 * TOTP MFA and recovery codes (API-8).
 *
 * RFC 6238 / RFC 4226 implemented directly on `node:crypto` — no dependency, no
 * network, and the RFC test vectors are asserted in the suite. MFA is behind a
 * configuration flag (`MFA_ENABLED`); when the flag is off the API behaves exactly
 * as before, so enabling it is an operational decision rather than a code change.
 */
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** New 160-bit secret, base32-encoded (the format authenticator apps expect). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** RFC 4226 HOTP for an explicit counter. */
export function hotp(secret: Buffer | string, counter: number, digits = 6): string {
  const key = typeof secret === 'string' ? base32Decode(secret) : secret;
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac('sha1', key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return (binary % 10 ** digits).toString().padStart(digits, '0');
}

export const TOTP_PERIOD_SECONDS = 30;

/** RFC 6238 TOTP for a point in time. */
export function totp(secret: Buffer | string, nowMs: number, digits = 6, periodSeconds = TOTP_PERIOD_SECONDS): string {
  return hotp(secret, Math.floor(nowMs / 1000 / periodSeconds), digits);
}

/**
 * Verifies a code with a ±1 step window (30 s either side) to tolerate clock skew.
 * Comparison is constant-time.
 */
export function verifyTotp(
  secret: Buffer | string,
  code: string,
  nowMs: number,
  options: { digits?: number; periodSeconds?: number; window?: number } = {},
): boolean {
  const digits = options.digits ?? 6;
  const periodSeconds = options.periodSeconds ?? TOTP_PERIOD_SECONDS;
  const window = options.window ?? 1;
  const candidate = code.replace(/\s/g, '');
  if (!/^\d+$/.test(candidate) || candidate.length !== digits) return false;

  const counter = Math.floor(nowMs / 1000 / periodSeconds);
  for (let drift = -window; drift <= window; drift += 1) {
    const expected = hotp(secret, counter + drift, digits);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(candidate))) return true;
  }
  return false;
}

/** otpauth:// URL for the enrolment QR code. */
export function otpauthUrl(params: {
  secret: string;
  account: string;
  issuer?: string;
  digits?: number;
  periodSeconds?: number;
}): string {
  const issuer = params.issuer ?? 'Lux-Tax';
  const label = encodeURIComponent(`${issuer}:${params.account}`);
  const query = new URLSearchParams({
    secret: params.secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(params.digits ?? 6),
    period: String(params.periodSeconds ?? TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Human-transcribable code: 4 groups of 4, ambiguous characters removed. */
export function generateRecoveryCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < 4; g += 1) {
    let group = '';
    for (let i = 0; i < 4; i += 1) group += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
    groups.push(group);
  }
  return groups.join('-');
}

export function generateRecoveryCodes(count = 10): string[] {
  const codes = new Set<string>();
  while (codes.size < count) codes.add(generateRecoveryCode());
  return [...codes];
}

/** Recovery codes are stored hashed, never in clear. */
export function hashRecoveryCode(code: string): string {
  const normalised = normaliseRecoveryCode(code);
  return createHmac('sha256', 'luxtax-recovery').update(normalised).digest('hex');
}

export function normaliseRecoveryCode(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/** Constant-time check of a submitted recovery code against stored hashes. */
export function verifyRecoveryCode(code: string, storedHashes: readonly string[]): number {
  const candidate = Buffer.from(hashRecoveryCode(code));
  for (let i = 0; i < storedHashes.length; i += 1) {
    const stored = Buffer.from(storedHashes[i]);
    if (stored.length === candidate.length && timingSafeEqual(stored, candidate)) return i;
  }
  return -1;
}

/** Operational switch; defaults to off so existing deployments are unchanged. */
export function isMfaEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.MFA_ENABLED ?? '').toLowerCase() === 'true';
}
