import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  MODEL_KEY_ENCRYPTION_ENV,
  ModelKeyStorageUnavailableError,
  decryptModelApiKey,
  encryptModelApiKey,
  isEncryptedModelKey,
  parseModelKeyEncryptionKey,
} from '../src/modules/admin/model-key-cipher';

/**
 * At-rest encryption regression tests for third-party model API keys (M2).
 * Pure crypto: no database, no network.
 */
const KEY = 'a1'.repeat(32); // 64 hex characters = 32 bytes
const OTHER_KEY = '5c'.repeat(32);
const PLAINTEXT = 'sk-live-mistral-super-secret-0001';

describe('Model API key encryption (M2)', () => {
  afterEach(() => {
    delete process.env[MODEL_KEY_ENCRYPTION_ENV];
  });

  test('a stored key round-trips through AES-256-GCM', () => {
    const stored = encryptModelApiKey(PLAINTEXT, KEY);

    assert.strictEqual(isEncryptedModelKey(stored), true);
    assert.ok(stored.startsWith('v1:'));
    assert.strictEqual(decryptModelApiKey(stored, KEY), PLAINTEXT);
  });

  test('the envelope carries iv, auth tag and ciphertext, never the plaintext', () => {
    const stored = encryptModelApiKey(PLAINTEXT, KEY);
    const [version, ivHex, tagHex, ciphertextHex] = stored.split(':');

    assert.strictEqual(version, 'v1');
    assert.strictEqual(ivHex.length, 24); // 12 bytes
    assert.strictEqual(tagHex.length, 32); // 16 bytes
    assert.ok(ciphertextHex.length > 0);
    assert.strictEqual(stored.includes(PLAINTEXT), false);
    assert.strictEqual(stored.includes('secret'), false);
  });

  test('every write uses a fresh IV, so equal keys produce different ciphertext', () => {
    const first = encryptModelApiKey(PLAINTEXT, KEY);
    const second = encryptModelApiKey(PLAINTEXT, KEY);

    assert.notStrictEqual(first, second);
    assert.strictEqual(decryptModelApiKey(first, KEY), PLAINTEXT);
    assert.strictEqual(decryptModelApiKey(second, KEY), PLAINTEXT);
  });

  test('storing fails closed when MODEL_KEY_ENCRYPTION_KEY is missing or malformed', () => {
    for (const key of [undefined, null, '', '   ', 'a1'.repeat(31), 'a1'.repeat(33), 'z'.repeat(64)]) {
      assert.throws(
        () => encryptModelApiKey(PLAINTEXT, key),
        (err: unknown) =>
          err instanceof ModelKeyStorageUnavailableError &&
          err.name === 'ModelKeyStorageUnavailableError' &&
          err.message.includes(MODEL_KEY_ENCRYPTION_ENV),
        `key ${String(key)} must be refused`,
      );
    }
  });

  test('the environment variable is the default key source', () => {
    process.env[MODEL_KEY_ENCRYPTION_ENV] = KEY;
    const stored = encryptModelApiKey(PLAINTEXT);
    assert.strictEqual(decryptModelApiKey(stored), PLAINTEXT);

    process.env[MODEL_KEY_ENCRYPTION_ENV] = 'not-hex';
    assert.throws(() => encryptModelApiKey(PLAINTEXT), ModelKeyStorageUnavailableError);
  });

  test('decryption fails closed on a wrong key, tampering, or a missing key', () => {
    const stored = encryptModelApiKey(PLAINTEXT, KEY);

    assert.strictEqual(decryptModelApiKey(stored, OTHER_KEY), null);
    assert.strictEqual(decryptModelApiKey(stored, null), null);

    const parts = stored.split(':');
    const flippedCiphertext = parts[3].slice(0, -1) + (parts[3].endsWith('0') ? '1' : '0');
    assert.strictEqual(decryptModelApiKey([parts[0], parts[1], parts[2], flippedCiphertext].join(':'), KEY), null);

    const flippedTag = parts[2].slice(0, -1) + (parts[2].endsWith('0') ? '1' : '0');
    assert.strictEqual(decryptModelApiKey([parts[0], parts[1], flippedTag, parts[3]].join(':'), KEY), null);

    assert.strictEqual(decryptModelApiKey('v1:aa:bb:cc', KEY), null);
    assert.strictEqual(decryptModelApiKey('', KEY), null);
  });

  test('a legacy plaintext value is not silently accepted as a credential', () => {
    assert.strictEqual(isEncryptedModelKey(PLAINTEXT), false);
    assert.strictEqual(decryptModelApiKey(PLAINTEXT, KEY), null);
  });

  test('only a 32-byte hex key is accepted', () => {
    assert.strictEqual(parseModelKeyEncryptionKey(KEY)?.length, 32);
    assert.strictEqual(parseModelKeyEncryptionKey(` ${KEY} `)?.length, 32);
    assert.strictEqual(parseModelKeyEncryptionKey(KEY.slice(2)), null);
    assert.strictEqual(parseModelKeyEncryptionKey(`${KEY}00`), null);
    assert.strictEqual(parseModelKeyEncryptionKey(undefined), null);
  });
});
