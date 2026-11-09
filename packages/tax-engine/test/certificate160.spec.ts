import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TaxClass, TaxResidence, FactCategory } from '@luxtax/contracts';
import {
  CERTIFICATE_160_CODES,
  isCertificate160FieldKey,
  lookupCertificate160Code,
  normalizeCertificate160Code,
  LuxembourgTaxEngine,
} from '../src/index';

/**
 * Certificate 160 (modèle 160F) is the employer's salary certificate. It reaches the engine as
 * OCR'd facts whose `fieldKey` is a certificate code rather than an engine field key, so this
 * table is the only thing standing between a misread certificate and a wrong tax return.
 *
 * These tests pin two layers:
 *  - the table's own invariants (a half-added code cannot ship silently);
 *  - the engine's behaviour on a code, including the rule that a fact it cannot map is
 *    **reported and excluded**, never quietly summed into an income line.
 */

const base = {
  taxClass: TaxClass.CLASS_1,
  residence: TaxResidence.RESIDENT,
  primaryUserId: 'u1',
  taxYear: 2025,
} as const;

const taxableOf = (facts: Array<Record<string, unknown>>): number =>
  LuxembourgTaxEngine.calculate({ ...base, facts: facts as never }).taxableIncome;

describe('certificate 160 — table invariants', () => {
  it('every entry agrees with its own key and declares a real category', () => {
    const categories = new Set(Object.values(FactCategory) as string[]);
    for (const [key, entry] of Object.entries(CERTIFICATE_160_CODES)) {
      assert.equal(entry.code, key, `entry ${key} has code ${entry.code}`);
      assert.ok(
        categories.has(entry.category),
        `entry ${key} uses unknown category ${entry.category}`,
      );
    }
  });

  it('supported entries carry a field key; unsupported ones carry none', () => {
    for (const entry of Object.values(CERTIFICATE_160_CODES)) {
      if (entry.supported) {
        assert.ok(entry.fieldKey.trim().length > 0, `${entry.code} is supported but has no field key`);
      } else {
        assert.equal(
          entry.fieldKey,
          '',
          `${entry.code} is unsupported but maps to "${entry.fieldKey}", which the engine would still read`,
        );
      }
    }
  });

  it('every entry is labelled in both languages and explains itself', () => {
    for (const entry of Object.values(CERTIFICATE_160_CODES)) {
      assert.ok(entry.labelFr.trim().length > 0, `${entry.code} has no French label`);
      assert.ok(entry.labelDe.trim().length > 0, `${entry.code} has no German label`);
      assert.ok((entry.note ?? '').trim().length > 0, `${entry.code} has no note`);
    }
  });

  it('keeps the five numeric ACD codes and the letter codes the audit relies on', () => {
    for (const code of ['101', '102', '103', '105', '141', 'S', 'P', 'LRCP']) {
      assert.ok(CERTIFICATE_160_CODES[code], `missing code ${code}`);
      assert.equal(CERTIFICATE_160_CODES[code]!.supported, true, `${code} should be supported`);
    }
  });
});

describe('certificate 160 — code normalisation', () => {
  it('strips the extractor prefix and normalises case and whitespace', () => {
    assert.equal(normalizeCertificate160Code('code_101'), '101');
    assert.equal(normalizeCertificate160Code('CODE_141'), '141');
    assert.equal(normalizeCertificate160Code('  fd '), 'FD');
    assert.equal(normalizeCertificate160Code('lrcp'), 'LRCP');
  });

  it('returns an empty string for absent input', () => {
    assert.equal(normalizeCertificate160Code(null), '');
    assert.equal(normalizeCertificate160Code(undefined), '');
    assert.equal(normalizeCertificate160Code('   '), '');
  });

  it('looks codes up through the normalised form', () => {
    assert.equal(lookupCertificate160Code('code_103')?.fieldKey, 'socialSecurity');
    assert.equal(lookupCertificate160Code(' s ')?.fieldKey, 'grossSalary');
    assert.equal(lookupCertificate160Code('999'), undefined);
    assert.equal(lookupCertificate160Code(''), undefined);
    assert.equal(lookupCertificate160Code(null), undefined);
  });
});

describe('certificate 160 — which keys are certificate-shaped', () => {
  it('accepts the extractor prefix, three-digit codes and single letters', () => {
    for (const key of ['code_101', '101', '104', 'S', 'p', 'FD', 'FFO', 'LRCP']) {
      assert.equal(isCertificate160FieldKey(key), true, `${key} should be certificate-shaped`);
    }
  });

  it('treats an unmapped single letter as certificate-shaped so it warns instead of vanishing', () => {
    assert.equal(isCertificate160FieldKey('E'), true);
    assert.equal(lookupCertificate160Code('E'), undefined);
  });

  it('leaves engine field keys alone', () => {
    for (const key of ['grossSalary', 'socialSecurity', 'mortgageInterest', 'art111bis']) {
      assert.equal(isCertificate160FieldKey(key), false, `${key} should not be certificate-shaped`);
    }
  });

  it('accepts `lrcp` because the certificate code and the engine key are the same word', () => {
    // Deliberate overlap, not a defect: the table maps LRCP back to the `lrcp` deduction, so a
    // fact written either way lands on the same line. Pinned so a future rename is noticed.
    assert.equal(isCertificate160FieldKey('lrcp'), true);
    assert.equal(lookupCertificate160Code('lrcp')?.category, 'LRCP_CONTRIBUTION');
    assert.equal(lookupCertificate160Code('lrcp')?.fieldKey, 'lrcp');
  });

  it('rejects empty and absent keys', () => {
    assert.equal(isCertificate160FieldKey(''), false);
    assert.equal(isCertificate160FieldKey('   '), false);
    assert.equal(isCertificate160FieldKey(null), false);
    assert.equal(isCertificate160FieldKey(undefined), false);
  });
});

describe('certificate 160 — engine behaviour', () => {
  it('code_101 produces the same return as the engine field key', () => {
    const viaCode = taxableOf([
      { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'code_101', amount: 50_000 },
    ]);
    const viaKey = taxableOf([
      { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 50_000 },
    ]);
    assert.equal(viaCode, viaKey);
    assert.ok(viaCode > 0);
  });

  it('adds 101 and 102 into one gross salary', () => {
    const split = taxableOf([
      { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: '101', amount: 30_000 },
      { id: 'f2', category: 'EMPLOYMENT_INCOME', fieldKey: '102', amount: 20_000 },
    ]);
    assert.equal(
      split,
      taxableOf([
        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 50_000 },
      ]),
    );
  });

  it('lets the table override a wrong category hint from the extractor', () => {
    const wrongHint = taxableOf([
      { id: 'f1', category: 'PENSION_INCOME', fieldKey: 'code_101', amount: 50_000 },
    ]);
    const employment = taxableOf([
      { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'code_101', amount: 50_000 },
    ]);
    assert.equal(wrongHint, employment);
  });

  it('warns and excludes an unknown certificate code', () => {
    const result = LuxembourgTaxEngine.calculate({
      ...base,
      facts: [
        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'code_999', amount: 50_000 },
      ] as never,
    });
    assert.ok(
      result.warnings.some((w) => /not supported by this engine/.test(w)),
      JSON.stringify(result.warnings),
    );
    assert.equal(result.taxableIncome, 0, 'the ignored fact must not reach an income line');
  });

  it('warns and excludes a known withholding-base code without inventing a return line', () => {
    const result = LuxembourgTaxEngine.calculate({
      ...base,
      facts: [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'FD', amount: 2_000 }] as never,
    });
    assert.ok(
      result.warnings.some((w) => /withholding-base label, not a return fact/.test(w)),
      JSON.stringify(result.warnings),
    );
    assert.equal(result.taxableIncome, 0);
  });

  it('keeps an ignored fact out of the provenance of the income line', () => {
    const result = LuxembourgTaxEngine.calculate({
      ...base,
      facts: [
        { id: 'kept', category: 'EMPLOYMENT_INCOME', fieldKey: 'S', amount: 40_000 },
        { id: 'dropped', category: 'EMPLOYMENT_INCOME', fieldKey: 'code_777', amount: 9_000 },
      ] as never,
    });
    assert.equal(
      result.taxableIncome,
      taxableOf([{ id: 'kept', category: 'EMPLOYMENT_INCOME', fieldKey: 'S', amount: 40_000 }]),
    );
  });

  it('maps 141 to mortgage interest and P to pension income', () => {
    assert.equal(lookupCertificate160Code('141')?.category, 'MORTGAGE_INTEREST');
    assert.equal(lookupCertificate160Code('P')?.fieldKey, 'grossPension');
    const pension = taxableOf([
      { id: 'f1', category: 'PENSION_INCOME', fieldKey: 'P', amount: 40_000 },
    ]);
    assert.ok(pension > 0);
  });
});
