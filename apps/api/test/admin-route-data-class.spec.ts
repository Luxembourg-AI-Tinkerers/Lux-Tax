import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  isCustomerDataClass,
  permitsDataClass,
  routeAssignmentViolations,
  routeDataClassViolation,
} from '../src/modules/admin/data-class-policy';

/**
 * Regression tests for the data-class guard (M3). Before the guard, a model
 * registered as PUBLIC or SYNTHETIC could be assigned to a CUSTOMER_DOCUMENT
 * route and would then receive full salary certificates.
 */
const documentRoute = { taskName: 'document.extract.salary_certificate', maxDataClass: 'CUSTOMER_DOCUMENT' };

describe('Model route data-class policy (M3)', () => {
  test('a CUSTOMER_DOCUMENT route requires a model that permits it', () => {
    assert.strictEqual(
      routeDataClassViolation(documentRoute, {
        modelId: 'mdl-docling-v2',
        permittedDataClass: 'CUSTOMER_DOCUMENT',
        role: 'primary',
      }),
      null,
    );

    for (const permittedDataClass of ['PUBLIC', 'SYNTHETIC', 'REDACTED_CUSTOMER']) {
      const violation = routeDataClassViolation(documentRoute, {
        modelId: 'mdl-weaker',
        permittedDataClass,
        role: 'primary',
      });
      assert.ok(violation, `${permittedDataClass} must not serve CUSTOMER_DOCUMENT`);
      assert.match(violation as string, /mdl-weaker/);
      assert.match(violation as string, /CUSTOMER_DOCUMENT/);
      assert.match(violation as string, /salary_certificate/);
    }
  });

  test('a PUBLIC or SYNTHETIC model may never be selected for a CUSTOMER_DOCUMENT task', () => {
    for (const permittedDataClass of ['PUBLIC', 'SYNTHETIC']) {
      const violation = routeDataClassViolation(documentRoute, {
        modelId: 'mdl-public',
        permittedDataClass,
        role: 'fallback',
      });
      assert.ok(violation);
      assert.match(violation as string, /may never be selected/);
    }
  });

  test('a narrower REDACTED_CUSTOMER fallback stays allowed — the seeded registry relies on it', () => {
    assert.strictEqual(
      routeDataClassViolation(documentRoute, {
        modelId: 'mdl-qwen35-4b',
        permittedDataClass: 'REDACTED_CUSTOMER',
        role: 'fallback',
      }),
      null,
    );
  });

  test('public-only routes may use public and synthetic models', () => {
    const publicRoute = { taskName: 'document.classify.public', maxDataClass: 'PUBLIC' };
    for (const permittedDataClass of ['PUBLIC', 'SYNTHETIC', 'REDACTED_CUSTOMER', 'CUSTOMER_DOCUMENT']) {
      assert.strictEqual(
        routeDataClassViolation(publicRoute, { modelId: 'mdl-any', permittedDataClass, role: 'primary' }),
        null,
      );
      assert.strictEqual(
        routeDataClassViolation(publicRoute, { modelId: 'mdl-any', permittedDataClass, role: 'fallback' }),
        null,
      );
    }
  });

  test('unknown data classes fail closed instead of authorising a route', () => {
    const unknownModel = routeDataClassViolation(documentRoute, {
      modelId: 'mdl-mystery',
      permittedDataClass: 'TOP_SECRET',
      role: 'primary',
    });
    assert.ok(unknownModel);
    assert.match(unknownModel as string, /unknown data class/);

    const unknownRoute = routeDataClassViolation(
      { taskName: 'document.extract.unknown', maxDataClass: 'EVERYTHING' },
      { modelId: 'mdl-docling-v2', permittedDataClass: 'CUSTOMER_DOCUMENT', role: 'primary' },
    );
    assert.ok(unknownRoute);
    assert.match(unknownRoute as string, /unknown data class/);
  });

  test('a full assignment reports every violation at once', () => {
    const violations = routeAssignmentViolations(
      documentRoute,
      { modelId: 'mdl-primary', permittedDataClass: 'PUBLIC', role: 'primary' },
      [
        { modelId: 'mdl-fallback-public', permittedDataClass: 'SYNTHETIC', role: 'fallback' },
        { modelId: 'mdl-fallback-ok', permittedDataClass: 'CUSTOMER_DOCUMENT', role: 'fallback' },
      ],
    );

    assert.strictEqual(violations.length, 2);
    assert.match(violations[0], /mdl-primary/);
    assert.match(violations[1], /mdl-fallback-public/);
  });

  test('the eligibility helpers rank the classes', () => {
    assert.strictEqual(permitsDataClass('CUSTOMER_DOCUMENT', 'CUSTOMER_DOCUMENT'), true);
    assert.strictEqual(permitsDataClass('CUSTOMER_DOCUMENT', 'REDACTED_CUSTOMER'), true);
    assert.strictEqual(permitsDataClass('REDACTED_CUSTOMER', 'CUSTOMER_DOCUMENT'), false);
    assert.strictEqual(permitsDataClass('PUBLIC', 'REDACTED_CUSTOMER'), false);
    assert.strictEqual(permitsDataClass('PUBLIC', 'PUBLIC'), true);
    assert.strictEqual(permitsDataClass('nonsense', 'PUBLIC'), false);

    assert.strictEqual(isCustomerDataClass('CUSTOMER_DOCUMENT'), true);
    assert.strictEqual(isCustomerDataClass('REDACTED_CUSTOMER'), true);
    assert.strictEqual(isCustomerDataClass('SYNTHETIC'), false);
    assert.strictEqual(isCustomerDataClass('PUBLIC'), false);
    assert.strictEqual(isCustomerDataClass('nonsense'), false);
  });
});
