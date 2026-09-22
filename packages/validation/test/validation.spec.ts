import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  registerSchema,
  loginSchema,
  createHouseholdSchema,
  inviteMemberSchema,
  initWorkspaceSchema,
  uploadDocumentSchema,
  confirmFactSchema,
} from '../dist/index.js';
import { HouseholdRole, TaxResidence, FactCategory } from '@luxtax/contracts';

describe('Validation Schemas', () => {
  describe('registerSchema', () => {
    it('accepts valid registration input', () => {
      const result = registerSchema.safeParse({
        email: 'Dupont.Tax@Example.LU',
        password: 'Password123!',
        firstName: 'Jean',
        lastName: 'Dupont',
      });
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.email, 'dupont.tax@example.lu');
      }
    });

    it('rejects weak passwords missing numbers', () => {
      const result = registerSchema.safeParse({
        email: 'valid@example.lu',
        password: 'WeakPasswordOnly',
      });
      assert.strictEqual(result.success, false);
    });

    it('rejects short passwords', () => {
      const result = registerSchema.safeParse({
        email: 'valid@example.lu',
        password: 'Short1',
      });
      assert.strictEqual(result.success, false);
    });

    it('rejects invalid email formats', () => {
      const result = registerSchema.safeParse({
        email: 'not-an-email',
        password: 'Password123!',
      });
      assert.strictEqual(result.success, false);
    });
  });

  describe('createHouseholdSchema', () => {
    it('validates minimum length', () => {
      assert.strictEqual(createHouseholdSchema.safeParse({ name: 'A' }).success, false);
      assert.strictEqual(createHouseholdSchema.safeParse({ name: 'Dupont-Muller' }).success, true);
    });
  });

  describe('inviteMemberSchema', () => {
    it('validates spousal invitation roles', () => {
      const result = inviteMemberSchema.safeParse({
        email: 'spouse@example.lu',
        role: HouseholdRole.CO_FILER,
      });
      assert.strictEqual(result.success, true);
    });
  });

  describe('initWorkspaceSchema', () => {
    it('validates 2025 startup tax year', () => {
      const result = initWorkspaceSchema.safeParse({
        taxYear: 2025,
        residenceStatus: TaxResidence.RESIDENT,
      });
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.taxYear, 2025);
      }
    });

    it('rejects out-of-range tax years', () => {
      assert.strictEqual(initWorkspaceSchema.safeParse({ taxYear: 1999 }).success, false);
      assert.strictEqual(initWorkspaceSchema.safeParse({ taxYear: 2040 }).success, false);
    });
  });

  describe('uploadDocumentSchema', () => {
    it('validates pdf document upload', () => {
      const result = uploadDocumentSchema.safeParse({
        fileName: 'certificat_remuneration_2025.pdf',
        fileContentBase64: 'JVBERi0xLjQK...',
        mimeType: 'application/pdf',
      });
      assert.strictEqual(result.success, true);
    });

    it('rejects unsupported executable mime types', () => {
      const result = uploadDocumentSchema.safeParse({
        fileName: 'malware.exe',
        fileContentBase64: 'TVqQAAMAAAAEAAAA...',
        mimeType: 'application/x-msdownload',
      });
      assert.strictEqual(result.success, false);
    });
  });

  describe('confirmFactSchema', () => {
    it('validates confirmed fact decimal currency format', () => {
      const result = confirmFactSchema.safeParse({
        category: FactCategory.EMPLOYMENT_INCOME,
        fieldKey: 'grossSalary',
        amount: '65432.10',
        currency: 'EUR',
      });
      assert.strictEqual(result.success, true);
    });

    it('rejects invalid non-numeric amount', () => {
      const result = confirmFactSchema.safeParse({
        category: FactCategory.EMPLOYMENT_INCOME,
        fieldKey: 'grossSalary',
        amount: 'not-a-number',
      });
      assert.strictEqual(result.success, false);
    });
  });
});
