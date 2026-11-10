import { test, describe } from 'node:test';
import assert from 'node:assert';
import { AuditEventType, type AuditEventDto } from '@luxtax/contracts';
import {
  REDACTED_DOCUMENT_DESCRIPTION,
  redactAuditEventForViewer,
} from '../src/modules/audit/audit-redaction';

function event(overrides: Partial<AuditEventDto> = {}): AuditEventDto {
  return {
    id: 'event-1',
    householdId: 'household-1',
    workspaceId: 'workspace-1',
    actorId: 'user-1',
    actorEmail: 'spouse@example.lu',
    eventType: AuditEventType.DOCUMENT_UPLOADED,
    entityType: 'Document',
    entityId: 'doc-private',
    previousValue: { fileName: 'old-payslip.pdf' },
    newValue: { fileName: 'payslip-2025.pdf', documentType: 'SALARY_SLIP' },
    description: 'Uploaded document "payslip-2025.pdf" classified as SALARY_SLIP',
    ipAddress: '203.0.113.7',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const alwaysVisible = () => true;
const neverVisible = () => false;

describe('activity feed — a VIEWER does not learn who acted or what a private document is called', () => {
  test('actor e-mail, IP and user agent are withheld', () => {
    const redacted = redactAuditEventForViewer(event(), alwaysVisible);

    assert.strictEqual(redacted.actorEmail, undefined);
    assert.strictEqual(redacted.ipAddress, undefined);
    assert.strictEqual(redacted.userAgent, undefined);
    // The rest of the row is still useful history.
    assert.strictEqual(redacted.actorId, 'user-1');
    assert.strictEqual(redacted.entityType, 'Document');
    assert.strictEqual(redacted.createdAt, '2026-01-01T00:00:00.000Z');
  });

  test('a private-draft document name is replaced and dropped from the values', () => {
    const redacted = redactAuditEventForViewer(event(), neverVisible);

    assert.strictEqual(redacted.description, REDACTED_DOCUMENT_DESCRIPTION);
    assert.strictEqual('fileName' in (redacted.newValue ?? {}), false);
    assert.strictEqual('fileName' in (redacted.previousValue ?? {}), false);
    // Non-identifying detail survives.
    assert.strictEqual(redacted.newValue?.documentType, 'SALARY_SLIP');
    assert.strictEqual(JSON.stringify(redacted).includes('payslip-2025.pdf'), false);
  });

  test('a shared document keeps its name, but still not the actor identity', () => {
    const redacted = redactAuditEventForViewer(event(), alwaysVisible);

    assert.strictEqual(redacted.description, event().description);
    assert.strictEqual(redacted.newValue?.fileName, 'payslip-2025.pdf');
    assert.strictEqual(redacted.actorEmail, undefined);
  });

  test('a non-document event keeps its description', () => {
    const redacted = redactAuditEventForViewer(
      event({
        entityType: 'ConfirmedFact',
        entityId: 'fact-1',
        description: 'Confirmed fact "grossSalary" for 84000 EUR',
        newValue: { amount: '84000' },
      }),
      neverVisible,
    );

    assert.strictEqual(redacted.description, 'Confirmed fact "grossSalary" for 84000 EUR');
    assert.strictEqual(redacted.actorEmail, undefined);
  });
});
