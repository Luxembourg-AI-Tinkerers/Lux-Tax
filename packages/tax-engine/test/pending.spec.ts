import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RULES_2026 } from '../src/rules/2026';
import { RULES_2025 } from '../src/rules/2025';
import { RULES_2028 } from '../src/rules/2028';
import type { RulePackage } from '../src/rules/types';
import {
  assertPendingConsistency,
  checkPendingConsistency,
  cicForMonthlySalary,
  cicFromTable,
  pendingMeasureStatus,
} from '../src/pending';

const clone = (pkg: RulePackage): RulePackage => JSON.parse(JSON.stringify(pkg));

describe('pending-measure gate', () => {
  it('every shipped package is internally consistent', () => {
    for (const pkg of [RULES_2025, RULES_2026, RULES_2028]) {
      assert.deepEqual(checkPendingConsistency(pkg), [], `package ${pkg.version}`);
      assert.doesNotThrow(() => assertPendingConsistency(pkg));
    }
  });

  it('2026 declares both 8775 measures as not in force', () => {
    assert.equal(pendingMeasureStatus(RULES_2026, 'CIC_2026'), 'NOT_IN_FORCE');
    assert.equal(pendingMeasureStatus(RULES_2026, 'EPARGNE_LOGEMENT_8775'), 'NOT_IN_FORCE');
    assert.equal(RULES_2026.specialExpenses.savingsHousingYoungMaxAge, 40);
    assert.equal(RULES_2026.cic, undefined);
  });

  it('returns NOT_IN_FORCE rather than zero while unpublished', () => {
    const result = cicForMonthlySalary(RULES_2026, 4_000);
    assert.equal(result.status, 'NOT_IN_FORCE');
    assert.equal(result.monthlyAmount, 0);
    assert.match(result.note ?? '', /No CIC table for tax year 2026/);
  });

  it('applies the table only when it exists and the measure is in force', () => {
    const pkg = clone(RULES_2026);
    const activated: RulePackage = {
      ...pkg,
      cic: {
        bands: [
          { from: 0, to: 3_000, slope: 0.02, offset: 0 },
          { from: 3_000.01, to: 5_000, slope: 0.01, offset: 30 },
        ],
        topAmount: 10,
        topUpTo: 6_000,
      },
      pendingMeasures: pkg.pendingMeasures?.map((m) =>
        m.id === 'CIC_2026' ? { ...m, status: 'IN_FORCE' as const } : m,
      ),
    };

    assert.deepEqual(checkPendingConsistency(activated), [], 'activation must be coherent');

    const inside = cicForMonthlySalary(activated, 3_000);
    assert.equal(inside.status, 'APPLIED');
    assert.equal(inside.monthlyAmount, 60); // 2 % of 3 000
    assert.equal(inside.annualAmount, 720);

    const upper = cicForMonthlySalary(activated, 4_000);
    assert.equal(upper.monthlyAmount, 70); // 1 % of 4 000 + 30
    assert.equal(upper.band?.from, 3_000.01);

    const top = cicForMonthlySalary(activated, 5_500);
    assert.equal(top.monthlyAmount, 10);

    const above = cicForMonthlySalary(activated, 6_500);
    assert.equal(above.monthlyAmount, 0);
    assert.match(above.note ?? '', /outside every published CIC band/);
  });

  it('a table without the measure in force grants nothing', () => {
    const pkg = clone(RULES_2026);
    const tableButDormant: RulePackage = {
      ...pkg,
      cic: { bands: [{ from: 0, to: 10_000, slope: 0.01, offset: 0 }] },
    };
    const result = cicForMonthlySalary(tableButDormant, 4_000);
    assert.equal(result.status, 'NOT_IN_FORCE');
    assert.match(result.note ?? '', /not in force yet/);
  });

  it('detects a measure declared in force without its data', () => {
    const pkg = clone(RULES_2026);
    const broken: RulePackage = {
      ...pkg,
      pendingMeasures: pkg.pendingMeasures?.map((m) =>
        m.id === 'CIC_2026' ? { ...m, status: 'IN_FORCE' as const } : m,
      ),
    };
    const problems = checkPendingConsistency(broken);
    assert.equal(problems.length, 1);
    assert.match(problems[0]!, /CIC_2026 is IN_FORCE but the package has no cic table/);
    assert.throws(() => assertPendingConsistency(broken), /inconsistent/);
  });

  it('detects a table present while the measure is not in force', () => {
    const pkg = clone(RULES_2026);
    const contradictory: RulePackage = {
      ...pkg,
      cic: { bands: [{ from: 0, to: 10_000, slope: 0.01, offset: 0 }] },
    };
    const problems = checkPendingConsistency(contradictory);
    assert.equal(problems.length, 1);
    assert.match(problems[0]!, /the two contradict each other/);
  });

  it('detects the épargne-logement flip without the age change', () => {
    const pkg = clone(RULES_2026);
    const halfDone: RulePackage = {
      ...pkg,
      pendingMeasures: pkg.pendingMeasures?.map((m) =>
        m.id === 'EPARGNE_LOGEMENT_8775' ? { ...m, status: 'IN_FORCE' as const } : m,
      ),
    };
    const problems = checkPendingConsistency(halfDone);
    assert.equal(problems.length, 1);
    assert.match(problems[0]!, /savingsHousingYoungMaxAge is 40, expected 200/);
  });

  it('accepts the full 8775 activation as a coherent package', () => {
    const pkg = clone(RULES_2026);
    const fullyActivated: RulePackage = {
      ...pkg,
      cic: { bands: [{ from: 0, to: 10_000, slope: 0.01, offset: 0 }], topAmount: 5 },
      specialExpenses: { ...pkg.specialExpenses, savingsHousingYoungMaxAge: 200 },
      pendingMeasures: pkg.pendingMeasures?.map((m) => ({ ...m, status: 'IN_FORCE' as const })),
    };
    assert.deepEqual(checkPendingConsistency(fullyActivated), []);
    assert.equal(cicForMonthlySalary(fullyActivated, 2_000).monthlyAmount, 20);
  });

  it('flags a measure with no source or activation text', () => {
    const pkg = clone(RULES_2026);
    const unexplained: RulePackage = {
      ...pkg,
      pendingMeasures: [{ id: 'X', status: 'NOT_IN_FORCE', source: ' ', activation: '' }],
    };
    const problems = checkPendingConsistency(unexplained);
    assert.equal(problems.length, 2);
    assert.match(problems[0]!, /missing source reference/);
    assert.match(problems[1]!, /missing activation description/);
  });

  it('rounds the monthly amount up to the cent and never negative', () => {
    const table = {
      bands: [{ from: 0, to: 9_999, slope: 0.03333, offset: 0 }],
    };
    assert.equal(cicFromTable(table, 1_000).monthlyAmount, 33.33);
    assert.equal(cicFromTable(table, 0).monthlyAmount, 0);
    assert.equal(
      cicFromTable({ bands: [{ from: 0, to: 100, slope: 0, offset: -50 }] }, 50).monthlyAmount,
      0,
    );
  });
});
