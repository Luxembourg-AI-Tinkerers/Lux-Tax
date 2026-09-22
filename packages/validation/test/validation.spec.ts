import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  registerSchema,
  loginSchema,
  createHouseholdSchema,
  inviteMemberSchema,
  initWorkspaceSchema,
} from '../dist/index.js';
import { HouseholdRole, TaxResidence } from '@luxtax/contracts';

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
});
