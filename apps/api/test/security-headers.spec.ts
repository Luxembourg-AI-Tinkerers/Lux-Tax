import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Defect H4: `@fastify/helmet` was a declared dependency that `main.ts` never
 * imported, so live responses carried no CSP, no nosniff, no frame guard, no HSTS
 * and no Referrer-/Permissions-Policy. This pins the registration, because the
 * failure mode is silent: the app boots happily and simply serves no headers.
 *
 * The header values themselves were verified against a Fastify instance built with
 * these exact options: CSP `default-src 'none';base-uri 'none';form-action 'none';
 * frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `X-Frame-Options:
 * DENY`, `Strict-Transport-Security: max-age=15552000; includeSubDomains`,
 * `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy: cross-origin`.
 */
const main = readFileSync(join(__dirname, '..', 'src', 'main.ts'), 'utf8');

describe('security headers are registered (H4)', () => {
  test('helmet is imported and registered before the server listens', () => {
    assert.match(main, /import helmet from '@fastify\/helmet';/);
    const register = main.indexOf('app.register(helmet');
    const listen = main.indexOf('app.listen(');
    assert.ok(register > -1, 'app.register(helmet, …) is missing from main.ts');
    assert.ok(listen > -1, 'app.listen( not found');
    assert.ok(register < listen, 'helmet must be registered before listen()');
  });

  test('the CSP locks a JSON API down instead of allowing defaults', () => {
    assert.match(main, /contentSecurityPolicy:\s*\{/);
    assert.match(main, /useDefaults:\s*false/);
    for (const directive of ['default-src', 'base-uri', 'form-action', 'frame-ancestors']) {
      assert.match(
        main,
        new RegExp(`'${directive}':\\s*\\["'none'"\\]`),
        `CSP directive ${directive} is not locked to 'none'`,
      );
    }
  });

  test('HSTS, frame, referrer and resource-policy options are set', () => {
    const hsts = /strictTransportSecurity:\s*\{[^}]*maxAge:\s*(\d+)[^}]*includeSubDomains:\s*true/.exec(
      main,
    );
    assert.ok(hsts, 'strictTransportSecurity with maxAge and includeSubDomains is missing');
    assert.ok(
      Number(hsts![1]) >= 15552000,
      `HSTS max-age ${hsts![1]} is shorter than 180 days`,
    );
    assert.match(main, /xFrameOptions:\s*\{\s*action:\s*'deny'\s*\}/);
    assert.match(main, /referrerPolicy:\s*\{\s*policy:\s*'no-referrer'\s*\}/);
    // The API is read by the web app on another origin, so CORP cannot be same-origin.
    assert.match(main, /crossOriginResourcePolicy:\s*\{\s*policy:\s*'cross-origin'\s*\}/);
  });

  test('Permissions-Policy is sent, since helmet 8 no longer sets it', () => {
    assert.match(main, /reply\.header\('Permissions-Policy',\s*PERMISSIONS_POLICY\)/);
    assert.match(main, /const PERMISSIONS_POLICY =/);
    assert.match(main, /camera=\(\)/);
  });
});
