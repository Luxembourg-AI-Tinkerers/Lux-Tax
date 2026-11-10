import { test, describe } from 'node:test';
import assert from 'node:assert';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MembershipStatus } from '@luxtax/contracts';
import { HouseholdGuard } from '../src/common/guards/household.guard';

/**
 * Guards run before pipes, so nothing else validates a route id. A malformed id
 * used to reach Prisma and answer 500 (M7); these tests pin the deny-first
 * behaviour of both id branches.
 */

interface FakeCalls {
  workspace: number;
  membership: number;
  membershipHouseholdId: string | null;
}

function fakePrisma(options: {
  workspace?: { householdId: string } | null;
  membership?: { status: string } | null;
} = {}) {
  const calls: FakeCalls = { workspace: 0, membership: 0, membershipHouseholdId: null };
  const prisma = {
    taxYearWorkspace: {
      findUnique: async () => {
        calls.workspace += 1;
        return options.workspace ?? null;
      },
    },
    householdMembership: {
      findUnique: async (args: any) => {
        calls.membership += 1;
        calls.membershipHouseholdId = args?.where?.householdId_userId?.householdId ?? null;
        return options.membership ?? null;
      },
    },
  };
  return { prisma, calls };
}

function contextFor(
  params: Record<string, string>,
  user: { id: string } | null = { id: 'user-1' },
): ExecutionContext {
  const request = { params, user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

const guardWith = (prisma: any) => new HouseholdGuard(prisma, new Reflector());

describe('HouseholdGuard id validation (M7)', () => {
  test('a malformed household id is refused before Prisma is queried', async () => {
    const { prisma, calls } = fakePrisma();
    const guard = guardWith(prisma);

    await assert.rejects(
      () => guard.canActivate(contextFor({ id: 'not-a-uuid' })),
      (error: unknown) => {
        assert.ok(error instanceof ForbiddenException);
        assert.strictEqual(error.getStatus(), 403);
        assert.strictEqual(error.message, 'Invalid household id');
        return true;
      },
    );
    assert.deepStrictEqual(
      calls,
      { workspace: 0, membership: 0, membershipHouseholdId: null },
      'nothing may reach the database for a malformed id',
    );
  });

  test('a malformed householdId param is refused the same way', async () => {
    const { prisma, calls } = fakePrisma();
    const guard = guardWith(prisma);

    await assert.rejects(
      () => guard.canActivate(contextFor({ householdId: '123' })),
      ForbiddenException,
    );
    assert.strictEqual(calls.membership, 0);
  });

  test('a well-formed household id still resolves the membership', async () => {
    const householdId = '24bdd81f-1d1b-4f27-8f1b-2a2d6c1f0a11';
    const { prisma, calls } = fakePrisma({
      membership: { status: MembershipStatus.ACTIVE },
    });
    const guard = guardWith(prisma);

    assert.strictEqual(await guard.canActivate(contextFor({ id: householdId })), true);
    assert.strictEqual(calls.membership, 1);
    assert.strictEqual(calls.membershipHouseholdId, householdId);
  });

  test('a malformed workspace id is still refused (previous behaviour kept)', async () => {
    const { prisma, calls } = fakePrisma();
    const guard = guardWith(prisma);

    await assert.rejects(
      () => guard.canActivate(contextFor({ workspaceId: 'not-a-uuid' })),
      (error: unknown) => {
        assert.ok(error instanceof ForbiddenException);
        assert.strictEqual(error.message, 'Invalid workspace id');
        return true;
      },
    );
    assert.strictEqual(calls.workspace, 0);
    assert.strictEqual(calls.membership, 0);
  });

  test('a workspace id still resolves its household through the workspace row', async () => {
    const workspaceId = '0f0e6f3e-6f0a-4a5f-9d3b-2c5c1a7e4b21';
    const householdId = '24bdd81f-1d1b-4f27-8f1b-2a2d6c1f0a11';
    const { prisma, calls } = fakePrisma({
      workspace: { householdId },
      membership: { status: MembershipStatus.ACTIVE },
    });
    const guard = guardWith(prisma);

    assert.strictEqual(await guard.canActivate(contextFor({ workspaceId })), true);
    assert.strictEqual(calls.workspace, 1);
    assert.strictEqual(calls.membershipHouseholdId, householdId);
  });

  test('an unresolved household context is denied, not passed through', async () => {
    const { prisma } = fakePrisma();
    const guard = guardWith(prisma);

    await assert.rejects(() => guard.canActivate(contextFor({})), ForbiddenException);
  });

  test('an inactive membership is denied', async () => {
    const { prisma } = fakePrisma({
      membership: { status: MembershipStatus.REMOVED },
    });
    const guard = guardWith(prisma);

    await assert.rejects(
      () =>
        guard.canActivate(contextFor({ id: '24bdd81f-1d1b-4f27-8f1b-2a2d6c1f0a11' })),
      ForbiddenException,
    );
  });

  test('an unauthenticated request is denied before any id is read', async () => {
    const { prisma, calls } = fakePrisma();
    const guard = guardWith(prisma);

    await assert.rejects(
      () => guard.canActivate(contextFor({ id: 'not-a-uuid' }, null)),
      (error: unknown) => {
        assert.ok(error instanceof ForbiddenException);
        assert.strictEqual(error.message, 'User is not authenticated');
        return true;
      },
    );
    assert.strictEqual(calls.membership, 0);
  });
});
