/**
 * Sealing for the TOTP seed.
 *
 * A TOTP secret is a second factor: if it sits in plaintext, a database read is
 * enough to mint valid codes forever. It is sealed with AES-256-GCM under a key
 * derived from the application secret, so a dump alone does not yield it.
 *
 * The derivation is HKDF over `JWT_ACCESS_SECRET` with a distinct info label, so
 * one configured value can key both purposes without the two secrets being
 * interchangeable.
 */
import * as crypto from 'crypto';
import { jwtAccessSecret } from '../../config/runtime-config';

const VERSION = 'v1';
const INFO = 'luxtax:totp-seed:v1';

function key(): Buffer {
  return Buffer.from(
    crypto.hkdfSync('sha256', Buffer.from(jwtAccessSecret(), 'utf8'), Buffer.alloc(0), INFO, 32),
  );
}

export function sealSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join(':');
}

export function openSecret(sealed: string): string {
  const parts = sealed.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Unsupported sealed secret format');
  }
  const [, iv, tag, payload] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(payload, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
