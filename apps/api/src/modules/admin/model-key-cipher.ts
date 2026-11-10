import * as crypto from 'crypto';

/**
 * At-rest encryption for third-party model API keys.
 *
 * `custom_ai_models.api_key` is a plain string column (no schema change is
 * allowed here), so the ciphertext is packed into that string:
 *
 *   `v1:<iv hex>:<auth tag hex>:<ciphertext hex>`
 *
 * AES-256-GCM with a random 12-byte IV per write. The key comes from
 * `MODEL_KEY_ENCRYPTION_KEY` (32 bytes as 64 hex characters).
 *
 * Fail closed: without a usable key nothing is encrypted and therefore nothing
 * is stored — `encryptModelApiKey` throws rather than silently writing plaintext.
 * Decryption returns `null` when the key is missing, the value is not a `v1:`
 * envelope, or the authentication tag does not verify; callers must treat that
 * as "no usable credential", never as "no credential needed".
 */
export const MODEL_KEY_ENCRYPTION_ENV = 'MODEL_KEY_ENCRYPTION_KEY';

const ENVELOPE_VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class ModelKeyStorageUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelKeyStorageUnavailableError';
  }
}

export function parseModelKeyEncryptionKey(
  raw: string | null | undefined,
): Buffer | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) return null;
  return Buffer.from(trimmed, 'hex');
}

/** `true` when the stored value is a `v1:` ciphertext envelope. */
export function isEncryptedModelKey(stored: string | null | undefined): boolean {
  return typeof stored === 'string' && stored.startsWith(`${ENVELOPE_VERSION}:`);
}

/**
 * Encrypts a model API key for storage. Throws
 * `ModelKeyStorageUnavailableError` when `MODEL_KEY_ENCRYPTION_KEY` is absent
 * or not 32 bytes of hex — callers must surface that instead of storing.
 */
export function encryptModelApiKey(
  plaintext: string,
  rawKey: string | null | undefined = process.env[MODEL_KEY_ENCRYPTION_ENV],
): string {
  const key = parseModelKeyEncryptionKey(rawKey);
  if (!key) {
    throw new ModelKeyStorageUnavailableError(
      `${MODEL_KEY_ENCRYPTION_ENV} must hold 32 bytes of hex (64 characters); ` +
        'refusing to store a third-party API key in plaintext',
    );
  }

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENVELOPE_VERSION}:${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Decrypts a stored model API key. Returns `null` when the value cannot be
 * decrypted with the configured key — missing env var, foreign envelope,
 * tampered ciphertext or wrong key.
 */
export function decryptModelApiKey(
  stored: string | null | undefined,
  rawKey: string | null | undefined = process.env[MODEL_KEY_ENCRYPTION_ENV],
): string | null {
  if (!isEncryptedModelKey(stored)) return null;
  const key = parseModelKeyEncryptionKey(rawKey);
  if (!key) return null;

  const parts = (stored as string).split(':');
  if (parts.length !== 4) return null;

  const [, ivHex, tagHex, ciphertextHex] = parts;
  if (!/^[0-9a-f]{2,64}$/i.test(ivHex)) return null;
  if (!/^[0-9a-f]{32}$/i.test(tagHex)) return null;
  if (!/^(?:[0-9a-f]{2})*$/i.test(ciphertextHex)) return null;

  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null;

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextHex, 'hex')),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  } catch {
    return null;
  }
}
