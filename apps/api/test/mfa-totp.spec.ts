import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  base32Decode,
  base32Encode,
  generateRecoveryCode,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  hotp,
  isMfaEnabled,
  normaliseRecoveryCode,
  otpauthUrl,
  totp,
  verifyRecoveryCode,
  verifyTotp,
} from '../src/modules/auth/totp';

/** RFC 4226 / 6238 test key: ASCII "12345678901234567890". */
const RFC_SECRET_ASCII = Buffer.from('12345678901234567890', 'ascii');
const RFC_SECRET_BASE32 = base32Encode(RFC_SECRET_ASCII);

describe('TOTP / HOTP (API-8)', () => {
  test('base32 round-trips', () => {
    const bytes = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff]);
    assert.deepStrictEqual(base32Decode(base32Encode(bytes)), bytes);
    assert.strictEqual(base32Encode(Buffer.from('12345678901234567890', 'ascii')), 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });

  test('HOTP matches RFC 4226 Appendix D vectors', () => {
    const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
    expected.forEach((code, counter) => {
      assert.strictEqual(hotp(RFC_SECRET_ASCII, counter), code, `counter ${counter}`);
    });
  });

  test('TOTP matches RFC 6238 Appendix B vectors (SHA-1, 8 digits)', () => {
    const vectors: Array<[number, string]> = [
      [59, '94287082'],
      [1_111_111_109, '07081804'],
      [1_111_111_111, '14050471'],
      [1_234_567_890, '89005924'],
      [2_000_000_000, '69279037'],
      [20_000_000_000, '65353130'],
    ];
    for (const [seconds, code] of vectors) {
      assert.strictEqual(totp(RFC_SECRET_ASCII, seconds * 1000, 8), code, `t=${seconds}`);
    }
  });

  test('verification accepts the current step and one step of skew only', () => {
    const now = 1_700_000_000_000;
    const code = totp(RFC_SECRET_BASE32, now);

    assert.strictEqual(verifyTotp(RFC_SECRET_BASE32, code, now), true);
    assert.strictEqual(verifyTotp(RFC_SECRET_BASE32, code, now + 29_000), true);
    assert.strictEqual(verifyTotp(RFC_SECRET_BASE32, code, now - 29_000), true);

    // two steps away is outside the window
    assert.strictEqual(verifyTotp(RFC_SECRET_BASE32, code, now + 61_000), false);
    // malformed input is refused, not thrown
    assert.strictEqual(verifyTotp(RFC_SECRET_BASE32, '12345', now), false);
    assert.strictEqual(verifyTotp(RFC_SECRET_BASE32, 'abcdef', now), false);
    assert.strictEqual(verifyTotp(RFC_SECRET_BASE32, '', now), false);
  });

  test('a different secret rejects the code', () => {
    const now = 1_700_000_000_000;
    const code = totp(RFC_SECRET_BASE32, now);
    assert.strictEqual(verifyTotp(base32Encode(Buffer.from('another-secret-value')), code, now), false);
  });

  test('generated secrets are 32 base32 chars and unique', () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    assert.match(a, /^[A-Z2-7]{32}$/);
    assert.notStrictEqual(a, b);
  });

  test('otpauth URL carries the RFC parameters', () => {
    const url = otpauthUrl({ secret: 'ABC234', account: 'marie@example.lu' });
    assert.ok(url.startsWith('otpauth://totp/'));
    assert.ok(url.includes('secret=ABC234'));
    assert.ok(url.includes('algorithm=SHA1'));
    assert.ok(url.includes('digits=6'));
    assert.ok(url.includes('period=30'));
    assert.ok(url.includes('issuer=Lux-Tax'));
  });
});

describe('Recovery codes (API-8)', () => {
  test('a code is four groups of four unambiguous characters', () => {
    const code = generateRecoveryCode();
    assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    // I, O, 0 and 1 are excluded so a user cannot mistype them
    assert.ok(!/[IO01]/.test(code));
  });

  test('a batch is unique', () => {
    const codes = generateRecoveryCodes(10);
    assert.strictEqual(codes.length, 10);
    assert.strictEqual(new Set(codes).size, 10);
  });

  test('hashing is case- and separator-insensitive, and never stores the clear code', () => {
    const code = generateRecoveryCode();
    const hash = hashRecoveryCode(code);
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.strictEqual(hashRecoveryCode(code.toLowerCase()), hash);
    assert.strictEqual(hashRecoveryCode(code.replace(/-/g, ' ')), hash);
    assert.ok(!hash.includes(normaliseRecoveryCode(code)));
  });

  test('verification returns the index of the matching code, else -1', () => {
    const codes = generateRecoveryCodes(3);
    const hashes = codes.map(hashRecoveryCode);
    assert.strictEqual(verifyRecoveryCode(codes[1], hashes), 1);
    assert.strictEqual(verifyRecoveryCode('AAAA-BBBB-CCCC-DDDD', hashes), -1);
  });

  test('a used code can be invalidated by removing its hash', () => {
    const codes = generateRecoveryCodes(2);
    const hashes = codes.map(hashRecoveryCode);
    const index = verifyRecoveryCode(codes[0], hashes);
    assert.strictEqual(index, 0);
    const remaining = hashes.filter((_, i) => i !== index);
    assert.strictEqual(verifyRecoveryCode(codes[0], remaining), -1);
    assert.strictEqual(verifyRecoveryCode(codes[1], remaining), 0);
  });
});

describe('MFA feature flag (API-8)', () => {
  test('is off unless MFA_ENABLED is exactly "true"', () => {
    assert.strictEqual(isMfaEnabled({} as NodeJS.ProcessEnv), false);
    assert.strictEqual(isMfaEnabled({ MFA_ENABLED: 'false' } as NodeJS.ProcessEnv), false);
    assert.strictEqual(isMfaEnabled({ MFA_ENABLED: '1' } as NodeJS.ProcessEnv), false);
    assert.strictEqual(isMfaEnabled({ MFA_ENABLED: 'TRUE' } as NodeJS.ProcessEnv), true);
    assert.strictEqual(isMfaEnabled({ MFA_ENABLED: 'true' } as NodeJS.ProcessEnv), true);
  });
});
