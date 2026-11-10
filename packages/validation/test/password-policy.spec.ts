import { test, describe } from 'node:test';
import assert from 'node:assert';
import { registerSchema } from '../src/auth.schema';

/**
 * The structural rules were already tested; these cover the denylist that closes
 * "a password which satisfies every rule and is still the first guess".
 */
describe('password denylist', () => {
  const parse = (password: string) =>
    registerSchema.safeParse({ email: 'someone@example.lu', password });

  test('the classic first guess is rejected', () => {
    assert.strictEqual(parse('password1').success, false);
  });

  test('case does not defeat the list', () => {
    assert.strictEqual(parse('PassWord123').success, false);
  });

  test('a long, unusual passphrase is accepted', () => {
    assert.strictEqual(parse('correct-horse-battery-9').success, true);
  });

  test('the structural rules still apply', () => {
    assert.strictEqual(parse('allletters').success, false, 'needs a digit');
    assert.strictEqual(parse('1234567').success, false, 'needs a letter and length');
  });
});
