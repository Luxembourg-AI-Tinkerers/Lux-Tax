import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  canIncludeInReturn,
  canReadDocument,
  isSharedForDiscussion,
  shouldRedactFactAudit,
  type Visibility,
} from '../src/modules/facts/fact-visibility';

const UPLOADER = '11111111-1111-4111-8111-111111111111';
const OWNER = '22222222-2222-4222-8222-222222222222';
const SPOUSE = '33333333-3333-4333-8333-333333333333';

describe('fact visibility — document reads', () => {
  test('PRIVATE_DRAFT is hidden from the spouse but visible to uploader and owner', () => {
    assert.strictEqual(
      canReadDocument('PRIVATE_DRAFT', UPLOADER, OWNER, SPOUSE),
      false,
    );
    assert.strictEqual(
      canReadDocument('PRIVATE_DRAFT', UPLOADER, OWNER, UPLOADER),
      true,
    );
    assert.strictEqual(
      canReadDocument('PRIVATE_DRAFT', UPLOADER, OWNER, OWNER),
      true,
    );
  });

  test('shared states are visible to every household member', () => {
    const shared: Visibility[] = [
      'SHARED_FOR_DISCUSSION',
      'PROPOSED_FOR_RETURN',
      'INCLUDED_IN_RETURN',
    ];

    for (const visibility of shared) {
      assert.strictEqual(
        canReadDocument(visibility, UPLOADER, OWNER, SPOUSE),
        true,
        `${visibility} must be visible to the spouse`,
      );
    }
  });

  test('ARCHIVED keeps the shared rule and does not become private again', () => {
    assert.strictEqual(
      canReadDocument('ARCHIVED', UPLOADER, OWNER, SPOUSE),
      true,
    );
  });

  test('missing ownership or user fails closed', () => {
    assert.strictEqual(canReadDocument('PRIVATE_DRAFT', null, null, SPOUSE), false);
    assert.strictEqual(canReadDocument('PRIVATE_DRAFT', UPLOADER, OWNER, null), false);
    assert.strictEqual(canReadDocument('PRIVATE_DRAFT', UPLOADER, OWNER, ''), false);
    // Unknown visibility is not treated as shared.
    assert.strictEqual(
      canReadDocument('SOMETHING_ELSE' as Visibility, UPLOADER, OWNER, SPOUSE),
      false,
    );
  });

  test('isSharedForDiscussion matches only SHARED_FOR_DISCUSSION', () => {
    assert.strictEqual(isSharedForDiscussion('SHARED_FOR_DISCUSSION'), true);
    assert.strictEqual(isSharedForDiscussion('PRIVATE_DRAFT'), false);
    assert.strictEqual(isSharedForDiscussion('PROPOSED_FOR_RETURN'), false);
    assert.strictEqual(isSharedForDiscussion('INCLUDED_IN_RETURN'), false);
    assert.strictEqual(isSharedForDiscussion('ARCHIVED'), false);
    assert.strictEqual(isSharedForDiscussion(null), false);
    assert.strictEqual(isSharedForDiscussion(undefined), false);
  });
});

describe('fact visibility — audit redaction', () => {
  test('a private-draft source is always redacted', () => {
    assert.strictEqual(shouldRedactFactAudit('PRIVATE_DRAFT', true), true);
    assert.strictEqual(shouldRedactFactAudit('PRIVATE_DRAFT', false), true);
  });

  test('a manual fact is redacted until its owner shares it', () => {
    assert.strictEqual(shouldRedactFactAudit(null, false), true);
    assert.strictEqual(shouldRedactFactAudit(undefined, false), true);
    assert.strictEqual(shouldRedactFactAudit(null, true), false);
    assert.strictEqual(shouldRedactFactAudit(undefined, true), false);
  });

  test('facts from shared, proposed, included or archived documents are not redacted', () => {
    const shared: Visibility[] = [
      'SHARED_FOR_DISCUSSION',
      'PROPOSED_FOR_RETURN',
      'INCLUDED_IN_RETURN',
      'ARCHIVED',
    ];

    for (const visibility of shared) {
      assert.strictEqual(
        shouldRedactFactAudit(visibility, true),
        false,
        `${visibility} is already readable through GET /facts`,
      );
      assert.strictEqual(shouldRedactFactAudit(visibility, false), false);
    }
  });

  test('an unknown visibility fails closed', () => {
    assert.strictEqual(
      shouldRedactFactAudit('SOMETHING_ELSE' as Visibility, true),
      true,
    );
  });
});

describe('fact visibility — return inclusion', () => {
  test('only PROPOSED_FOR_RETURN and INCLUDED_IN_RETURN may enter the return', () => {
    assert.strictEqual(canIncludeInReturn('PROPOSED_FOR_RETURN'), true);
    assert.strictEqual(canIncludeInReturn('INCLUDED_IN_RETURN'), true);
  });

  test('PRIVATE_DRAFT, SHARED_FOR_DISCUSSION and ARCHIVED are excluded', () => {
    assert.strictEqual(canIncludeInReturn('PRIVATE_DRAFT'), false);
    assert.strictEqual(canIncludeInReturn('SHARED_FOR_DISCUSSION'), false);
    assert.strictEqual(canIncludeInReturn('ARCHIVED'), false);
  });

  test('manual facts without a source document remain includable', () => {
    assert.strictEqual(canIncludeInReturn(null), true);
    assert.strictEqual(canIncludeInReturn(undefined), true);
  });
});
