import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  annexPdfFileName,
  annexPdfUrl,
  canSeeAmount,
  normaliseBaseUrl,
  redactFact,
  redactFacts,
  REDACTED_PLACEHOLDER,
  type RedactableFact,
} from '../src/lib/privacy';

describe('Private-draft redaction (MOB-5)', () => {
  test('the owner always sees their own amount', () => {
    const fact = { ownerId: 'u1', visibility: 'PRIVATE_DRAFT', fieldValue: '75000.00' };
    assert.strictEqual(canSeeAmount(fact, 'u1'), true);
    const result = redactFact(fact, 'u1');
    assert.strictEqual(result.redacted, false);
    assert.strictEqual(result.item.fieldValue, '75000.00');
  });

  test('another member sees the fact but not the amount of a private draft', () => {
    const fact = { ownerId: 'u1', visibility: 'PRIVATE_DRAFT', fieldValue: '75000.00' };
    assert.strictEqual(canSeeAmount(fact, 'u2'), false);
    const result = redactFact(fact, 'u2');
    assert.strictEqual(result.redacted, true);
    assert.strictEqual(result.item.fieldValue, REDACTED_PLACEHOLDER);
  });

  test('PROPOSED_FOR_RETURN and INCLUDED_IN_RETURN are household-visible', () => {
    for (const visibility of ['PROPOSED_FOR_RETURN', 'INCLUDED_IN_RETURN']) {
      const fact = { ownerId: 'u1', visibility, fieldValue: '1000.00' };
      assert.strictEqual(canSeeAmount(fact, 'u2'), true, visibility);
    }
  });

  test('SHARED_FOR_DISCUSSION alone does not expose the amount', () => {
    const fact = { ownerId: 'u1', visibility: 'SHARED_FOR_DISCUSSION', fieldValue: '500.00' };
    assert.strictEqual(canSeeAmount(fact, 'u2'), false);
  });

  test('an explicit isSharedWithHousehold flag wins', () => {
    const fact = { ownerId: 'u1', visibility: 'PRIVATE_DRAFT', isSharedWithHousehold: true, fieldValue: '500.00' };
    assert.strictEqual(canSeeAmount(fact, 'u2'), true);
  });

  test('a fact with no owner and no visibility is treated as private', () => {
    const noMetadata: RedactableFact = { fieldValue: '10.00' };
    assert.strictEqual(canSeeAmount(noMetadata, 'u2'), false);
    assert.strictEqual(canSeeAmount({ visibility: 'ARCHIVED' }, 'u2'), false);
  });

  test('a signed-out viewer sees no amounts', () => {
    const fact = { ownerId: 'u1', visibility: 'INCLUDED_IN_RETURN', fieldValue: '99.00' };
    assert.strictEqual(canSeeAmount(fact, null), true); // household-visible does not need an owner
    assert.strictEqual(canSeeAmount({ ownerId: 'u1', visibility: 'PRIVATE_DRAFT' }, null), false);
  });

  test('masking preserves the description and the field name', () => {
    const fact = { ownerId: 'u1', visibility: 'PRIVATE_DRAFT', fieldValue: '1.00', description: 'Salary certificate' };
    const { item } = redactFact(fact, 'u2');
    assert.strictEqual(item.description, 'Salary certificate');
    assert.strictEqual(item.fieldValue, REDACTED_PLACEHOLDER);
  });

  test('both fieldValue and amount are masked when present', () => {
    const fact = { ownerId: 'u1', visibility: 'PRIVATE_DRAFT', fieldValue: '1.00', amount: '1.00' };
    const { item } = redactFact(fact, 'u2');
    assert.strictEqual(item.fieldValue, REDACTED_PLACEHOLDER);
    assert.strictEqual(item.amount, REDACTED_PLACEHOLDER);
  });

  test('the list helper counts what it masked and leaves the rest intact', () => {
    const facts = [
      { ownerId: 'u1', visibility: 'PRIVATE_DRAFT', fieldValue: '1.00' },
      { ownerId: 'u2', visibility: 'PRIVATE_DRAFT', fieldValue: '2.00' },
      { ownerId: 'u1', visibility: 'INCLUDED_IN_RETURN', fieldValue: '3.00' },
    ];
    const { items, redactedCount } = redactFacts(facts, 'u1');
    assert.strictEqual(redactedCount, 1);
    assert.strictEqual(items[0].fieldValue, '1.00');
    assert.strictEqual(items[1].fieldValue, REDACTED_PLACEHOLDER);
    assert.strictEqual(items[2].fieldValue, '3.00');
  });
});

describe('Filing-package download URLs (MOB-5)', () => {
  test('joins the base URL without doubling the slash', () => {
    assert.strictEqual(normaliseBaseUrl('http://10.0.2.2:3001/'), 'http://10.0.2.2:3001');
    assert.strictEqual(
      annexPdfUrl('http://10.0.2.2:3001/', 'ws-1'),
      'http://10.0.2.2:3001/api/workspaces/ws-1/filing-package/annexes.pdf',
    );
    assert.strictEqual(
      annexPdfUrl('https://api.example.lu', 'ws-1'),
      'https://api.example.lu/api/workspaces/ws-1/filing-package/annexes.pdf',
    );
  });

  test('the workspace id is URL-encoded', () => {
    assert.ok(annexPdfUrl('https://a.b', 'a/b c').includes('a%2Fb%20c'));
  });

  test('the filename is safe and stable', () => {
    assert.strictEqual(annexPdfFileName(2025), 'luxtax-annexes-2025.pdf');
    assert.strictEqual(annexPdfFileName(2025, 'abcdef0123456789'), 'luxtax-annexes-2025-abcdef01.pdf');
  });

  test('a hostile hash cannot inject a path or a shell metacharacter', () => {
    const name = annexPdfFileName(2025, '../../etc/passwd;rm -rf');
    assert.strictEqual(name, 'luxtax-annexes-2025-etcpassw.pdf');
    assert.ok(!name.includes('/'));
    assert.ok(!name.includes('..'));
    assert.ok(!name.includes(';'));
  });
});
