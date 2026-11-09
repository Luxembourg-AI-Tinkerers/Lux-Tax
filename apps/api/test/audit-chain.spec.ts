import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  auditCategory,
  hashAuditEvent,
  verifyAuditChain,
  type AuditChainEntry,
} from '../src/modules/audit/audit-chain';

const base = {
  householdId: 'h1',
  workspaceId: 'w1',
  actorId: 'u1',
  entityType: 'Fact',
  entityId: 'f1',
  description: 'confirmed fact',
};

/** Builds a correctly chained list from plain payloads. */
function chain(count: number): AuditChainEntry[] {
  const entries: AuditChainEntry[] = [];
  let prevHash: string | null = null;
  for (let i = 0; i < count; i += 1) {
    const payload = {
      ...base,
      id: `e${i}`,
      eventType: 'FACT_CONFIRMED',
      createdAt: `2026-11-09T10:0${i}:00.000Z`,
      previousValue: null,
      newValue: { amount: i },
    };
    const hash = hashAuditEvent(prevHash, payload);
    entries.push({ ...payload, prevHash, hash });
    prevHash = hash;
  }
  return entries;
}

describe('Audit chain (API-10)', () => {
  test('a correctly built chain verifies', () => {
    assert.deepStrictEqual(verifyAuditChain(chain(5)), { valid: true });
    assert.deepStrictEqual(verifyAuditChain([]), { valid: true });
  });

  test('editing an event breaks verification at that event', () => {
    const entries = chain(4);
    entries[2] = { ...entries[2], description: 'tampered' };
    const result = verifyAuditChain(entries);
    assert.strictEqual(result.valid, false);
    if (!result.valid) assert.strictEqual(result.brokenAt, 'e2');
  });

  test('deleting an event breaks the link at its successor', () => {
    const entries = chain(4);
    const withoutSecond = [entries[0], entries[2], entries[3]];
    const result = verifyAuditChain(withoutSecond);
    assert.strictEqual(result.valid, false);
    if (!result.valid) assert.strictEqual(result.brokenAt, 'e2');
  });

  test('re-ordering two events is detected', () => {
    const entries = chain(3);
    const swapped = [entries[0], entries[2], entries[1]];
    assert.strictEqual(verifyAuditChain(swapped).valid, false);
  });

  test('the hash depends on the previous hash, so identical payloads differ by position', () => {
    const payload = {
      ...base,
      id: 'same',
      eventType: 'FACT_CONFIRMED',
      createdAt: '2026-11-09T10:00:00.000Z',
    };
    assert.notStrictEqual(hashAuditEvent(null, payload), hashAuditEvent('abc', payload));
  });

  test('canonical hashing is key-order independent', () => {
    const a = { ...base, id: 'x', eventType: 'FACT_CONFIRMED', createdAt: 't', extra: { b: 2, a: 1 } };
    const b = { extra: { a: 1, b: 2 }, createdAt: 't', eventType: 'FACT_CONFIRMED', id: 'x', ...base };
    assert.strictEqual(hashAuditEvent(null, a), hashAuditEvent(null, b));
  });

  test('event taxonomy covers every prefix in use', () => {
    assert.strictEqual(auditCategory('USER_LOGGED_IN'), 'AUTH');
    assert.strictEqual(auditCategory('HOUSEHOLD_CREATED'), 'HOUSEHOLD');
    assert.strictEqual(auditCategory('MEMBER_JOINED'), 'HOUSEHOLD');
    assert.strictEqual(auditCategory('DOCUMENT_UPLOADED'), 'DOCUMENT');
    assert.strictEqual(auditCategory('FACT_CONFIRMED'), 'FACT');
    assert.strictEqual(auditCategory('TAX_CALCULATED'), 'CALCULATION');
    assert.strictEqual(auditCategory('RETURN_APPROVED'), 'FILING');
    assert.strictEqual(auditCategory('APPROVAL_INVALIDATED'), 'FILING');
    assert.strictEqual(auditCategory('FILING_PACKAGE_GENERATED'), 'FILING');
    assert.strictEqual(auditCategory('ASSESSMENT_IMPORTED'), 'FILING');
    assert.strictEqual(auditCategory('WORKSPACE_INITIALIZED'), 'HOUSEHOLD');
  });

  test('an unknown event type falls back to ADMIN instead of throwing', () => {
    assert.strictEqual(auditCategory('SOMETHING_NEW'), 'ADMIN');
    assert.strictEqual(auditCategory(''), 'ADMIN');
  });
});
