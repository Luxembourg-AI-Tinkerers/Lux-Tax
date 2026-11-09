import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  isCertificate160FieldKey,
  lookupCertificate160Code,
} from '../src/forms/certificate160';

describe('Certificate 160 code shape (LEG-7 F3)', () => {
  test('an unknown single letter is certificate-shaped and warns downstream', () => {
    assert.strictEqual(isCertificate160FieldKey('X'), true);
    assert.strictEqual(lookupCertificate160Code('X'), undefined);
  });

  test('an unknown multi-letter code is no longer dropped silently', () => {
    for (const code of ['ZZ', 'FDD', 'ABC']) {
      assert.strictEqual(isCertificate160FieldKey(code), true, code);
      assert.strictEqual(lookupCertificate160Code(code), undefined, code);
    }
  });

  test('camelCase engine field keys are not certificate codes', () => {
    for (const key of ['grossSalary', 'socialSecurity', 'withholdingTax', 'rentalCharges']) {
      assert.strictEqual(isCertificate160FieldKey(key), false, key);
    }
  });

  test('a code_ prefix is always certificate-shaped, whatever follows', () => {
    assert.strictEqual(isCertificate160FieldKey('code_999'), true);
    assert.strictEqual(isCertificate160FieldKey('code_ZZ'), true);
  });
});
