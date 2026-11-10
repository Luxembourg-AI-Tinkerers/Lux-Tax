import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import {
  configurationProblems,
  assertRuntimeConfig,
  ConfigurationError,
  MIN_SECRET_LENGTH,
} from '../src/config/runtime-config';
import {
  credentialKey,
  isCredentialPath,
  isRateLimitEnabled,
} from '../src/common/guards/rate-limit.guard';

const GOOD_SECRET = 'a'.repeat(MIN_SECRET_LENGTH + 8);
const base = { JWT_ACCESS_SECRET: GOOD_SECRET, DATABASE_URL: 'postgresql://x' };

describe('runtime configuration', () => {
  test('accepts a complete environment', () => {
    assert.deepStrictEqual(configurationProblems(base as NodeJS.ProcessEnv), []);
  });

  test('rejects a missing secret instead of defaulting to a literal', () => {
    const problems = configurationProblems({ DATABASE_URL: 'postgresql://x' } as NodeJS.ProcessEnv);
    assert.strictEqual(problems.length, 1);
    assert.match(problems[0], /JWT_ACCESS_SECRET is required/);
  });

  test('rejects the example secret that used to be the fallback', () => {
    const problems = configurationProblems({
      ...base,
      JWT_ACCESS_SECRET: 'dev_luxembourg_tax_jwt_access_secret_32chars_min_2026',
    } as NodeJS.ProcessEnv);
    assert.ok(problems.some((p) => /committed to the repository/.test(p)));
  });

  test('rejects a short secret', () => {
    const problems = configurationProblems({ ...base, JWT_ACCESS_SECRET: 'short' } as NodeJS.ProcessEnv);
    assert.ok(problems.some((p) => /at least/.test(p)));
  });

  test('requires a database URL', () => {
    const problems = configurationProblems({ JWT_ACCESS_SECRET: GOOD_SECRET } as NodeJS.ProcessEnv);
    assert.ok(problems.some((p) => /DATABASE_URL/.test(p)));
  });

  test('production demands an https frontend origin', () => {
    const problems = configurationProblems({
      ...base,
      NODE_ENV: 'production',
      FRONTEND_URL: 'http://example.lu',
    } as NodeJS.ProcessEnv);
    assert.ok(problems.some((p) => /https in production/.test(p)));
  });

  test('assertRuntimeConfig throws one error carrying every problem', () => {
    assert.throws(
      () => assertRuntimeConfig({} as NodeJS.ProcessEnv),
      (error: unknown) =>
        error instanceof ConfigurationError &&
        (error as ConfigurationError).problems.length >= 2,
    );
  });
});

describe('rate limiting defaults', () => {
  test('is on unless explicitly disabled', () => {
    assert.strictEqual(isRateLimitEnabled({} as NodeJS.ProcessEnv), true);
    assert.strictEqual(isRateLimitEnabled({ RATE_LIMIT_ENABLED: 'true' } as NodeJS.ProcessEnv), true);
    assert.strictEqual(isRateLimitEnabled({ RATE_LIMIT_ENABLED: 'false' } as NodeJS.ProcessEnv), false);
    assert.strictEqual(isRateLimitEnabled({ RATE_LIMIT_ENABLED: 'FALSE' } as NodeJS.ProcessEnv), false);
  });

  test('credential endpoints are recognised, others are not', () => {
    assert.strictEqual(isCredentialPath('/api/auth/login'), true);
    assert.strictEqual(isCredentialPath('/api/auth/login?x=1'), true);
    assert.strictEqual(isCredentialPath('/api/auth/register'), true);
    assert.strictEqual(isCredentialPath('/api/auth/refresh'), true);
    assert.strictEqual(isCredentialPath('/api/auth/logout'), false);
    assert.strictEqual(isCredentialPath('/api/workspaces/abc/calculate'), false);
  });

  test('the credential bucket keys on the submitted address, not only the IP', () => {
    assert.notStrictEqual(
      credentialKey('1.2.3.4', 'a@example.lu'),
      credentialKey('1.2.3.4', 'b@example.lu'),
    );
    assert.strictEqual(credentialKey('1.2.3.4', 'A@Example.LU'), credentialKey('1.2.3.4', 'a@example.lu'));
    assert.strictEqual(credentialKey('1.2.3.4', undefined), 'credential:1.2.3.4:anonymous');
  });
});

describe('TOTP seed sealing', () => {
  before(() => {
    process.env.JWT_ACCESS_SECRET = GOOD_SECRET;
    process.env.DATABASE_URL = 'postgresql://x';
  });

  test('a sealed secret round-trips and is not stored in the clear', async () => {
    const { sealSecret, openSecret } = await import('../src/modules/auth/secret-box');
    const sealed = sealSecret('JBSWY3DPEHPK3PXP');
    assert.ok(!sealed.includes('JBSWY3DPEHPK3PXP'));
    assert.match(sealed, /^v1:/);
    assert.strictEqual(openSecret(sealed), 'JBSWY3DPEHPK3PXP');
  });

  test('tampering with the ciphertext is detected', async () => {
    const { sealSecret, openSecret } = await import('../src/modules/auth/secret-box');
    const sealed = sealSecret('JBSWY3DPEHPK3PXP');
    const parts = sealed.split(':');
    const corrupted = [parts[0], parts[1], parts[2], Buffer.from('other').toString('base64url')].join(':');
    assert.throws(() => openSecret(corrupted));
  });

  test('two seals of the same secret differ (random IV)', async () => {
    const { sealSecret } = await import('../src/modules/auth/secret-box');
    assert.notStrictEqual(sealSecret('JBSWY3DPEHPK3PXP'), sealSecret('JBSWY3DPEHPK3PXP'));
  });
});
