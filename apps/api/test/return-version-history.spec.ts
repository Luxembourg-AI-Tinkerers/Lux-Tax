import { test, describe } from 'node:test';
import assert from 'node:assert';
import type { ReturnVersionHistoryItemDto } from '@luxtax/contracts';
import {
  historyStatus,
  mergeHistory,
  requiredApproverCount,
  requiredApproverIds,
} from '../src/modules/filing/return-version-history';

function version(
  versionNumber: number,
  overrides: Partial<ReturnVersionHistoryItemDto> = {},
): ReturnVersionHistoryItemDto {
  return {
    id: `version-${versionNumber}`,
    versionNumber,
    isCurrent: false,
    isFrozen: false,
    status: 'DRAFT',
    createdAt: '2026-01-01T00:00:00.000Z',
    packageGenerated: false,
    approvals: [],
    ...overrides,
  };
}

describe('historyStatus', () => {
  test('the current version without approvals is a draft', () => {
    assert.strictEqual(historyStatus(3, 3, 0, 2), 'DRAFT');
  });

  test('the current version with every required approval is approved', () => {
    assert.strictEqual(historyStatus(3, 3, 2, 2), 'APPROVED');
  });

  test('a single filer is approved with one approval', () => {
    assert.strictEqual(historyStatus(1, 1, 1, 1), 'APPROVED');
  });

  test('a partially approved current version is still a draft', () => {
    assert.strictEqual(historyStatus(3, 3, 1, 2), 'DRAFT');
  });

  test('an older version is superseded even when it was fully approved', () => {
    assert.strictEqual(historyStatus(2, 3, 2, 2), 'SUPERSEDED');
  });

  test('no required approver never reads as approved', () => {
    assert.strictEqual(historyStatus(1, 1, 5, 0), 'DRAFT');
  });
});

describe('mergeHistory', () => {
  test('adds a synthetic current draft when the active version has no row', () => {
    const merged = mergeHistory([version(1, { status: 'SUPERSEDED' })], 2);

    assert.strictEqual(merged.length, 2);
    const current = merged[0];
    assert.strictEqual(current.versionNumber, 2);
    assert.strictEqual(current.status, 'DRAFT');
    assert.strictEqual(current.isCurrent, true);
    assert.strictEqual(current.isFrozen, false);
    assert.strictEqual(current.packageGenerated, false);
    assert.deepStrictEqual(current.approvals, []);
    // A version row does not exist until somebody approves: no id, no date.
    assert.strictEqual(current.id, undefined);
    assert.strictEqual(current.createdAt, undefined);
  });

  test('sorts newest first', () => {
    const merged = mergeHistory(
      [version(1), version(3, { isCurrent: true }), version(2)],
      3,
    );

    assert.deepStrictEqual(
      merged.map((item) => item.versionNumber),
      [3, 2, 1],
    );
  });

  test('does not duplicate the active version when its row exists', () => {
    const merged = mergeHistory(
      [version(1), version(2, { isCurrent: true, status: 'APPROVED' })],
      2,
    );

    assert.strictEqual(merged.length, 2);
    assert.strictEqual(merged[0].versionNumber, 2);
    assert.strictEqual(merged[0].status, 'APPROVED');
  });

  test('returns a new array instead of mutating the input', () => {
    const existing = [version(1), version(2)];
    const merged = mergeHistory(existing, 3);

    assert.strictEqual(existing.length, 2);
    assert.strictEqual(merged.length, 3);
  });
});

describe('requiredApproverIds (PROD-2)', () => {
  const member = (userId: string, role: string) => ({ userId, role });
  const couple = [member('primary', 'PRIMARY_FILER'), member('co', 'CO_FILER')];
  const withViewer = [...couple, member('viewer', 'VIEWER')];

  test('a VIEWER is never a required approver', () => {
    assert.deepStrictEqual(requiredApproverIds(withViewer), ['primary', 'co']);
  });

  test('a Class 2 couple still needs both filers', () => {
    assert.strictEqual(requiredApproverCount('CLASS_2', couple), 2);
    assert.strictEqual(requiredApproverCount('CLASS_2', withViewer), 2);
  });

  test('an invited viewer cannot raise the bar above the filers', () => {
    assert.notStrictEqual(
      requiredApproverCount('CLASS_2', withViewer),
      withViewer.length,
    );
  });

  test('a single filer needs one approval, whatever the class', () => {
    assert.strictEqual(requiredApproverCount('CLASS_1', couple), 1);
    assert.strictEqual(requiredApproverCount('CLASS_1a', withViewer), 1);
  });

  test('a viewer-only household never reports zero required approvals', () => {
    assert.deepStrictEqual(requiredApproverIds([member('v', 'VIEWER')]), []);
    assert.strictEqual(requiredApproverCount('CLASS_2', [member('v', 'VIEWER')]), 1);
    assert.strictEqual(historyStatus(1, 1, 0, 1), 'DRAFT');
  });

  test('the deadlock is gone: both filers approve and the version completes', () => {
    const required = requiredApproverIds(withViewer);
    const approved = ['primary', 'co'];
    assert.strictEqual(
      required.every((id) => approved.includes(id)),
      true,
      'the gate no longer waits for the viewer',
    );
    assert.strictEqual(
      historyStatus(2, 2, approved.length, requiredApproverCount('CLASS_2', withViewer)),
      'APPROVED',
    );
  });

  test('one filer alone is still incomplete after the fix', () => {
    const required = requiredApproverIds(withViewer);
    const approved = ['primary'];
    assert.strictEqual(required.every((id) => approved.includes(id)), false);
    assert.strictEqual(
      historyStatus(2, 2, approved.length, requiredApproverCount('CLASS_2', withViewer)),
      'DRAFT',
    );
  });
});
