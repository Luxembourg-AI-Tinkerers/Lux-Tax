import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  appendPackageEvidence,
  assertPackageRegenerationAllowed,
  currentPackageEvidence,
  FilingPackageImmutableError,
  MAX_EVIDENCE_ENTRIES,
  verifyPackageEvidence,
  type PackageEvidenceEntry,
} from '../src/modules/filing/filing-package-evidence';

describe('Filing-package evidence index (API-7)', () => {
  test('first generation creates a single open entry', () => {
    const history = appendPackageEvidence([], { sha256: 'aaa', generatedAt: '2026-11-09T10:00:00.000Z' });
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].sha256, 'aaa');
    assert.strictEqual(history[0].supersededAt, undefined);
  });

  test('regeneration marks the previous entry superseded instead of losing it', () => {
    const first = appendPackageEvidence([], { sha256: 'aaa', generatedAt: '2026-11-09T10:00:00.000Z' });
    const second = appendPackageEvidence(first, { sha256: 'bbb', generatedAt: '2026-11-09T11:00:00.000Z' });

    assert.strictEqual(second.length, 2);
    assert.strictEqual(second[0].sha256, 'aaa');
    assert.strictEqual(second[0].supersededAt, '2026-11-09T11:00:00.000Z');
    assert.strictEqual(second[1].sha256, 'bbb');
    assert.strictEqual(second[1].supersededAt, undefined);
    // the hash of the originally generated package survives
    assert.ok(second.some((entry) => entry.sha256 === 'aaa'));
  });

  test('exactly one entry is current after several generations', () => {
    let history: PackageEvidenceEntry[] = [];
    for (let i = 0; i < 5; i += 1) {
      history = appendPackageEvidence(history, {
        sha256: `sha-${i}`,
        generatedAt: `2026-11-09T1${i}:00:00.000Z`,
      });
    }
    assert.strictEqual(history.filter((entry) => !entry.supersededAt).length, 1);
    assert.strictEqual(currentPackageEvidence(history)?.sha256, 'sha-4');
  });

  test('the index is capped, oldest first', () => {
    let history: PackageEvidenceEntry[] = [];
    for (let i = 0; i < MAX_EVIDENCE_ENTRIES + 10; i += 1) {
      history = appendPackageEvidence(history, { sha256: `s${i}`, generatedAt: `t${i}` });
    }
    assert.strictEqual(history.length, MAX_EVIDENCE_ENTRIES);
    assert.strictEqual(history[history.length - 1].sha256, `s${MAX_EVIDENCE_ENTRIES + 9}`);
    assert.ok(!history.some((entry) => entry.sha256 === 's0'));
  });

  test('an already-filed package may not be regenerated', () => {
    assert.doesNotThrow(() => assertPackageRegenerationAllowed(false));
    assert.throws(
      () => assertPackageRegenerationAllowed(true),
      (error: unknown) =>
        error instanceof FilingPackageImmutableError && /amendment/i.test((error as Error).message),
    );
  });

  test('integrity check compares the stored hash with the payload hash', () => {
    const entry: PackageEvidenceEntry = { sha256: 'ABCDEF', generatedAt: 't' };
    assert.strictEqual(verifyPackageEvidence(entry, 'abcdef'), true);
    assert.strictEqual(verifyPackageEvidence(entry, 'abcdef0'), false);
    assert.strictEqual(verifyPackageEvidence(undefined, 'abcdef'), false);
  });

  test('tolerates a null or malformed history', () => {
    assert.strictEqual(appendPackageEvidence(null, { sha256: 'x', generatedAt: 't' }).length, 1);
    const messy = [null, { sha256: 'ok', generatedAt: 't1' }] as unknown as PackageEvidenceEntry[];
    assert.strictEqual(appendPackageEvidence(messy, { sha256: 'y', generatedAt: 't2' }).length, 2);
  });
});
