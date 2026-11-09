import { test, describe } from 'node:test';
import assert from 'node:assert';
import { isPlatformAdminEmail, parseAdminEmails } from '../src/common/auth/platform-admin';

describe('Platform administrator allowlist (ADMIN_EMAILS)', () => {
  test('unset or empty env yields no administrators — the gate fails closed', () => {
    assert.deepStrictEqual(parseAdminEmails(undefined), []);
    assert.deepStrictEqual(parseAdminEmails(''), []);
    assert.deepStrictEqual(parseAdminEmails('   '), []);
    assert.deepStrictEqual(parseAdminEmails(', ,,'), []);

    assert.strictEqual(isPlatformAdminEmail('admin@luxtax.lu', parseAdminEmails(undefined)), false);
    assert.strictEqual(isPlatformAdminEmail('admin@luxtax.lu', parseAdminEmails('')), false);
    assert.strictEqual(isPlatformAdminEmail('admin@luxtax.lu', []), false);
  });

  test('an exact entry matches', () => {
    const allowlist = parseAdminEmails('admin@luxtax.lu');
    assert.deepStrictEqual(allowlist, ['admin@luxtax.lu']);
    assert.strictEqual(isPlatformAdminEmail('admin@luxtax.lu', allowlist), true);
  });

  test('comma-separated entries are trimmed, lower-cased and matched case-insensitively', () => {
    const allowlist = parseAdminEmails('  Admin@LuxTax.LU , second@luxtax.lu ,');
    assert.deepStrictEqual(allowlist, ['admin@luxtax.lu', 'second@luxtax.lu']);
    assert.strictEqual(isPlatformAdminEmail('ADMIN@luxTAX.lu', allowlist), true);
    assert.strictEqual(isPlatformAdminEmail('  Admin@LuxTax.lu  ', allowlist), true);
    assert.strictEqual(isPlatformAdminEmail('second@luxtax.lu', allowlist), true);
  });

  test('no substring, prefix or suffix match', () => {
    const allowlist = parseAdminEmails('admin@luxtax.lu');
    assert.strictEqual(isPlatformAdminEmail('admin@luxtax.lu.attacker.example', allowlist), false);
    assert.strictEqual(isPlatformAdminEmail('notadmin@luxtax.lu', allowlist), false);
    assert.strictEqual(isPlatformAdminEmail('admin@luxtax', allowlist), false);
    assert.strictEqual(isPlatformAdminEmail('xadmin@luxtax.lu', allowlist), false);
  });

  test('an empty or missing candidate never matches', () => {
    const allowlist = parseAdminEmails('admin@luxtax.lu');
    assert.strictEqual(isPlatformAdminEmail('', allowlist), false);
    assert.strictEqual(isPlatformAdminEmail('   ', allowlist), false);
  });
});
