/**
 * The vault's visibility control used to promote PRIVATE -> SHARED -> INCLUDED
 * and then sit on INCLUDED forever, so a document could never be taken back out
 * of the return — and nothing asked before a click changed what gets filed.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DocumentVisibility } from '@luxtax/contracts';

import { nextDocumentVisibility, removesFromReturn } from '../src/lib/document-visibility';

describe('document visibility cycle', () => {
  it('walks the three reachable states and comes back to the draft', () => {
    assert.equal(
      nextDocumentVisibility(DocumentVisibility.PRIVATE_DRAFT),
      DocumentVisibility.SHARED_FOR_DISCUSSION,
    );
    assert.equal(
      nextDocumentVisibility(DocumentVisibility.SHARED_FOR_DISCUSSION),
      DocumentVisibility.INCLUDED_IN_RETURN,
    );
    assert.equal(
      nextDocumentVisibility(DocumentVisibility.INCLUDED_IN_RETURN),
      DocumentVisibility.PRIVATE_DRAFT,
    );
  });

  it('promotes a state the cycle does not offer instead of leaving it stuck', () => {
    assert.equal(
      nextDocumentVisibility(DocumentVisibility.ARCHIVED),
      DocumentVisibility.INCLUDED_IN_RETURN,
    );
  });

  it('flags every change that takes a document out of the return', () => {
    assert.equal(
      removesFromReturn(DocumentVisibility.INCLUDED_IN_RETURN, DocumentVisibility.PRIVATE_DRAFT),
      true,
    );
    assert.equal(
      removesFromReturn(DocumentVisibility.INCLUDED_IN_RETURN, DocumentVisibility.SHARED_FOR_DISCUSSION),
      true,
    );
  });

  it('does not flag promotions or changes made outside the return', () => {
    assert.equal(
      removesFromReturn(DocumentVisibility.PRIVATE_DRAFT, DocumentVisibility.SHARED_FOR_DISCUSSION),
      false,
    );
    assert.equal(
      removesFromReturn(DocumentVisibility.SHARED_FOR_DISCUSSION, DocumentVisibility.INCLUDED_IN_RETURN),
      false,
    );
    assert.equal(
      removesFromReturn(DocumentVisibility.INCLUDED_IN_RETURN, DocumentVisibility.INCLUDED_IN_RETURN),
      false,
    );
  });
});
