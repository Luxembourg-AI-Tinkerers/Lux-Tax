import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  addMonthsUtc,
  defaultAssessmentFollowUp,
  isObjectionOpen,
} from '../src/modules/filing/assessment-dates';

/** ISO calendar day of a UTC date, e.g. "2026-12-01". */
const iso = (date: Date): string => date.toISOString().slice(0, 10);

describe('addMonthsUtc', () => {
  test('adds whole months in UTC', () => {
    assert.strictEqual(iso(addMonthsUtc(new Date('2026-09-01'), 3)), '2026-12-01');
    assert.strictEqual(iso(addMonthsUtc(new Date('2026-09-01'), 1)), '2026-10-01');
  });

  test('clamps to the last day of a shorter target month', () => {
    assert.strictEqual(iso(addMonthsUtc(new Date('2026-01-31'), 3)), '2026-04-30');
  });

  test('clamps a leap day when the target year has no 29 February', () => {
    assert.strictEqual(iso(addMonthsUtc(new Date('2024-02-29'), 12)), '2025-02-28');
  });

  test('crosses the year boundary without drifting', () => {
    assert.strictEqual(iso(addMonthsUtc(new Date('2026-11-30'), 3)), '2027-02-28');
  });
});

describe('defaultAssessmentFollowUp', () => {
  test('objection is three months after the notice and follow-up 30 days after', () => {
    const { objectionDeadline, followUpAt } = defaultAssessmentFollowUp(
      new Date('2026-09-01'),
    );

    assert.strictEqual(iso(objectionDeadline), '2026-12-01');
    assert.strictEqual(iso(followUpAt), '2026-10-01');
  });

  test('returns UTC midnight even when the notice carries a time', () => {
    const { objectionDeadline, followUpAt } = defaultAssessmentFollowUp(
      new Date('2026-09-01T17:45:12.000Z'),
    );

    assert.strictEqual(objectionDeadline.toISOString(), '2026-12-01T00:00:00.000Z');
    assert.strictEqual(followUpAt.toISOString(), '2026-10-01T00:00:00.000Z');
  });
});

describe('isObjectionOpen', () => {
  const deadline = new Date('2026-12-01');

  test('is open on the deadline day itself, including its last second', () => {
    assert.strictEqual(isObjectionOpen(deadline, new Date('2026-12-01T00:00:00.000Z')), true);
    assert.strictEqual(isObjectionOpen(deadline, new Date('2026-12-01T23:59:59.999Z')), true);
  });

  test('is closed the next day', () => {
    assert.strictEqual(isObjectionOpen(deadline, new Date('2026-12-02T00:00:00.000Z')), false);
  });

  test('a missing deadline is never open', () => {
    assert.strictEqual(isObjectionOpen(null, new Date('2026-01-01')), false);
    assert.strictEqual(isObjectionOpen(undefined, new Date('2026-01-01')), false);
  });
});
