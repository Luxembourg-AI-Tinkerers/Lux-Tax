import { test, describe } from 'node:test';
import assert from 'node:assert';
import { BadRequestException } from '@nestjs/common';
import {
  CONFIRMED_FACT_IN_RETURN_WHERE,
  householdVisibleConfirmedFactWhere,
  householdVisibleDocumentWhere,
} from '../src/modules/facts/fact-visibility-query';
import { canStoreInReturn } from '../src/modules/facts/fact-visibility';
import { stripUnsharedSnapshotFacts } from '../src/modules/facts/fact-snapshot';
import { assertActiveHouseholdMember } from '../src/modules/facts/household-owner';
import type { PrismaService } from '../src/prisma/prisma.service';

const OWNER = '11111111-1111-4111-8111-111111111111';
const SPOUSE = '22222222-2222-4222-8222-222222222222';
const STRANGER = '33333333-3333-4333-8333-333333333333';

interface DocumentRow {
  uploaderId: string;
  ownerId: string | null;
  visibility: string;
}

interface FactRow {
  ownerId: string | null;
  isSharedWithHousehold: boolean;
  isIncludedInReturn: boolean;
  sourceDocumentId: string | null;
  sourceDocument?: DocumentRow | null;
}

/**
 * Minimal reader for the subset of Prisma `where` semantics the visibility
 * filters use (scalar equality, `OR`, `visibility: { in }` and the
 * `sourceDocument.is` relation). Good enough to prove which rows a filter
 * admits without a database.
 */
function matchesDocumentWhere(where: any, doc: DocumentRow): boolean {
  if (where.uploaderId !== undefined && where.uploaderId !== doc.uploaderId) {
    return false;
  }
  if (where.ownerId !== undefined && where.ownerId !== doc.ownerId) {
    return false;
  }
  if (where.visibility?.in && !where.visibility.in.includes(doc.visibility)) {
    return false;
  }
  if (where.OR) {
    const branches = Array.isArray(where.OR) ? where.OR : [where.OR];
    if (!branches.some((branch: any) => matchesDocumentWhere(branch, doc))) {
      return false;
    }
  }
  return true;
}

function matchesFactWhere(where: any, fact: FactRow): boolean {
  if (
    where.isIncludedInReturn !== undefined &&
    where.isIncludedInReturn !== fact.isIncludedInReturn
  ) {
    return false;
  }
  if (
    where.isSharedWithHousehold !== undefined &&
    where.isSharedWithHousehold !== fact.isSharedWithHousehold
  ) {
    return false;
  }
  if (where.ownerId !== undefined && where.ownerId !== fact.ownerId) {
    return false;
  }
  if (
    where.sourceDocumentId !== undefined &&
    where.sourceDocumentId !== fact.sourceDocumentId
  ) {
    return false;
  }
  if (where.sourceDocument?.is) {
    if (
      !fact.sourceDocument ||
      !matchesDocumentWhere(where.sourceDocument.is, fact.sourceDocument)
    ) {
      return false;
    }
  }
  if (where.OR) {
    const branches = Array.isArray(where.OR) ? where.OR : [where.OR];
    if (!branches.some((branch: any) => matchesFactWhere(branch, fact))) {
      return false;
    }
  }
  return true;
}

function includesInReturn(fact: FactRow): boolean {
  return matchesFactWhere(CONFIRMED_FACT_IN_RETURN_WHERE, fact);
}

function manualFact(overrides: Partial<FactRow> = {}): FactRow {
  return {
    ownerId: SPOUSE,
    isSharedWithHousehold: true,
    isIncludedInReturn: true,
    sourceDocumentId: null,
    sourceDocument: null,
    ...overrides,
  };
}

function documentFact(
  visibility: string,
  overrides: Partial<FactRow> = {},
): FactRow {
  return {
    ownerId: SPOUSE,
    isSharedWithHousehold: true,
    isIncludedInReturn: true,
    sourceDocumentId: 'doc-1',
    sourceDocument: { uploaderId: SPOUSE, ownerId: SPOUSE, visibility },
    ...overrides,
  };
}

describe('return snapshot — an unshared fact never enters it', () => {
  test('the return predicate requires the fact to be shared with the household', () => {
    assert.strictEqual(CONFIRMED_FACT_IN_RETURN_WHERE.isIncludedInReturn, true);
    assert.strictEqual(
      CONFIRMED_FACT_IN_RETURN_WHERE.isSharedWithHousehold,
      true,
      'isIncludedInReturn alone must not put a fact into the snapshot',
    );
  });

  test('a manual fact marked not-shared is excluded even with isIncludedInReturn:true', () => {
    // The reported leak: GET /facts hid this fact from the viewer while
    // GET /return-version served its amount from the snapshot.
    assert.strictEqual(
      includesInReturn(
        manualFact({ isSharedWithHousehold: false, isIncludedInReturn: true }),
      ),
      false,
    );
  });

  test('a shared, included manual fact still enters the return', () => {
    assert.strictEqual(includesInReturn(manualFact()), true);
  });

  test('a shared manual fact the owner excluded stays out', () => {
    assert.strictEqual(
      includesInReturn(manualFact({ isIncludedInReturn: false })),
      false,
    );
  });

  test('a fact from a private draft never enters the return, shared flag or not', () => {
    assert.strictEqual(includesInReturn(documentFact('PRIVATE_DRAFT')), false);
    assert.strictEqual(
      includesInReturn(documentFact('PRIVATE_DRAFT', { ownerId: OWNER })),
      false,
    );
  });

  test('a fact from a document only shared for discussion stays out', () => {
    assert.strictEqual(includesInReturn(documentFact('SHARED_FOR_DISCUSSION')), false);
    assert.strictEqual(includesInReturn(documentFact('ARCHIVED')), false);
  });

  test('a fact from a document proposed for or included in the return enters it', () => {
    assert.strictEqual(includesInReturn(documentFact('PROPOSED_FOR_RETURN')), true);
    assert.strictEqual(includesInReturn(documentFact('INCLUDED_IN_RETURN')), true);
  });
});

describe('write-time clamp — unshared facts are stored with isIncludedInReturn:false', () => {
  test('an unshared manual fact cannot be stored as included', () => {
    assert.strictEqual(canStoreInReturn(false, true, null), false);
    assert.strictEqual(canStoreInReturn(false, true, 'INCLUDED_IN_RETURN'), false);
  });

  test('a shared manual fact keeps the requested inclusion', () => {
    assert.strictEqual(canStoreInReturn(true, true, null), true);
    assert.strictEqual(canStoreInReturn(true, false, null), false);
  });

  test('the document rule still applies to a shared fact', () => {
    assert.strictEqual(canStoreInReturn(true, true, 'PRIVATE_DRAFT'), false);
    assert.strictEqual(canStoreInReturn(true, true, 'SHARED_FOR_DISCUSSION'), false);
    assert.strictEqual(canStoreInReturn(true, true, 'INCLUDED_IN_RETURN'), true);
  });
});

describe('household visibility — facts and documents list filters', () => {
  test('another member\'s unshared manual fact is not readable', () => {
    const where = householdVisibleConfirmedFactWhere(OWNER);
    assert.strictEqual(
      matchesFactWhere(where, manualFact({ isSharedWithHousehold: false })),
      false,
    );
    assert.strictEqual(
      matchesFactWhere(
        where,
        manualFact({ ownerId: OWNER, isSharedWithHousehold: false }),
      ),
      true,
      'the owner still reads their own private fact',
    );
  });

  test('a shared manual fact is readable by the household', () => {
    assert.strictEqual(matchesFactWhere(householdVisibleConfirmedFactWhere(OWNER), manualFact()), true);
  });

  test('a private-draft fact stays with its uploader and owner', () => {
    const where = householdVisibleConfirmedFactWhere(OWNER);
    assert.strictEqual(matchesFactWhere(where, documentFact('PRIVATE_DRAFT', { ownerId: SPOUSE })), false);
    assert.strictEqual(
      matchesFactWhere(
        where,
        documentFact('PRIVATE_DRAFT', { ownerId: OWNER, sourceDocument: { uploaderId: SPOUSE, ownerId: OWNER, visibility: 'PRIVATE_DRAFT' } }),
      ),
      true,
      'the owner of the private draft reads its facts',
    );
  });

  test('a shared document fact is readable', () => {
    assert.strictEqual(
      matchesFactWhere(householdVisibleConfirmedFactWhere(OWNER), documentFact('INCLUDED_IN_RETURN')),
      true,
    );
  });

  test('the documents filter hides another member\'s private draft', () => {
    const where = householdVisibleDocumentWhere(OWNER);
    const privateDraft: DocumentRow = {
      uploaderId: SPOUSE,
      ownerId: SPOUSE,
      visibility: 'PRIVATE_DRAFT',
    };
    assert.strictEqual(matchesDocumentWhere(where, privateDraft), false);
    assert.strictEqual(
      matchesDocumentWhere(where, { ...privateDraft, uploaderId: OWNER }),
      true,
      'the uploader still sees their own draft',
    );
    assert.strictEqual(
      matchesDocumentWhere(where, { ...privateDraft, visibility: 'SHARED_FOR_DISCUSSION' }),
      true,
    );
  });
});

describe('stored return snapshot — an unshared entry is not served', () => {
  test('the not-shared entry is dropped and the others are kept', () => {
    const snapshot = [
      { id: 'shared', isSharedWithHousehold: true, amount: '1000.00' },
      { id: 'private', isSharedWithHousehold: false, amount: '84000.00' },
      { id: 'legacy-without-flag' },
    ];

    const visible = stripUnsharedSnapshotFacts(snapshot) as Array<{ id: string }>;

    assert.deepStrictEqual(
      visible.map((fact) => fact.id),
      ['shared', 'legacy-without-flag'],
    );
    assert.strictEqual(JSON.stringify(visible).includes('84000'), false);
  });

  test('a snapshot that is not an array is returned untouched', () => {
    assert.strictEqual(stripUnsharedSnapshotFacts(null), null);
    assert.deepStrictEqual(stripUnsharedSnapshotFacts({ a: 1 }), { a: 1 });
  });
});

describe('fact owner must be an active member of this household', () => {
  const householdId = 'household-1';

  function fakePrisma(statuses: Record<string, string>): PrismaService {
    return {
      householdMembership: {
        findUnique: async ({ where }: any) => {
          const status = statuses[where.householdId_userId.userId];
          return status ? { status } : null;
        },
      },
    } as unknown as PrismaService;
  }

  test('an active member of the household is accepted', async () => {
    await assert.doesNotReject(
      assertActiveHouseholdMember(
        fakePrisma({ [SPOUSE]: 'ACTIVE' }),
        householdId,
        SPOUSE,
        'Fact owner must be an active member of this household',
      ),
    );
  });

  test('a stranger, an invited member or a removed member is rejected with 400', async () => {
    const cases: Array<[string, Record<string, string>]> = [
      ['no membership', {}],
      ['invited but not active', { [STRANGER]: 'INVITED' }],
      ['removed', { [STRANGER]: 'REMOVED' }],
    ];

    for (const [label, statuses] of cases) {
      await assert.rejects(
        assertActiveHouseholdMember(
          fakePrisma(statuses),
          householdId,
          STRANGER,
          'Fact owner must be an active member of this household',
        ),
        (error: unknown) => {
          assert.ok(error instanceof BadRequestException, label);
          assert.match(
            (error as BadRequestException).message,
            /active member of this household/,
            label,
          );
          return true;
        },
        label,
      );
    }
  });
});
