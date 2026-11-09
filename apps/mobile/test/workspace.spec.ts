import { test, describe } from 'node:test';
import assert from 'node:assert';
import { isWorkspaceScopedId, resolveWorkspace, type WorkspaceResolverClient } from '../src/lib/workspace';

/**
 * MOB-1 regression: the mobile flows used to pass a **household** id to
 * workspace-scoped endpoints. These tests pin the resolution contract, which is the
 * part of the fix that can be verified without a React Native build.
 */
function fakeClient(options: {
  households?: Array<{ id: string }>;
  workspace?: { id: string } | null;
  throwOnWorkspace?: boolean;
}): WorkspaceResolverClient {
  return {
    async getHouseholds() {
      return { data: options.households ?? [] };
    },
    async getWorkspace() {
      if (options.throwOnWorkspace) throw new Error('network down');
      return { data: options.workspace ?? null };
    },
  };
}

describe('Mobile workspace resolution (MOB-1)', () => {
  test('resolves the workspace id for the first household', async () => {
    const result = await resolveWorkspace(
      fakeClient({ households: [{ id: 'household-1' }], workspace: { id: 'workspace-9' } }),
      2025,
    );
    assert.deepStrictEqual(result, { ok: true, workspaceId: 'workspace-9', taxYear: 2025 });
  });

  test('uses an explicit household id when given', async () => {
    const result = await resolveWorkspace(
      fakeClient({ households: [{ id: 'household-1' }], workspace: { id: 'workspace-3' } }),
      2026,
      'household-3',
    );
    assert.strictEqual(result.ok, true);
    if (result.ok) assert.strictEqual(result.workspaceId, 'workspace-3');
  });

  test('reports NO_HOUSEHOLD instead of sending an empty id', async () => {
    const result = await resolveWorkspace(fakeClient({ households: [] }), 2025);
    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.strictEqual(result.reason, 'NO_HOUSEHOLD');
  });

  test('reports NO_WORKSPACE when the year has no workspace', async () => {
    const result = await resolveWorkspace(fakeClient({ households: [{ id: 'h' }], workspace: null }), 2025);
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.reason, 'NO_WORKSPACE');
      assert.match(result.message, /2025/);
    }
  });

  test('a thrown client error becomes an ERROR result, never an unhandled rejection', async () => {
    const result = await resolveWorkspace(
      fakeClient({ households: [{ id: 'h' }], throwOnWorkspace: true }),
      2025,
    );
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.reason, 'ERROR');
      assert.match(result.message, /network down/);
    }
  });

  test('the resolved id is never the household id', async () => {
    const householdId = 'aaaaaaaa-1111';
    const workspaceId = 'bbbbbbbb-2222';
    const result = await resolveWorkspace(
      fakeClient({ households: [{ id: householdId }], workspace: { id: workspaceId } }),
      2025,
    );
    assert.strictEqual(result.ok, true);
    if (result.ok) assert.notStrictEqual(result.workspaceId, householdId);
  });

  test('isWorkspaceScopedId rejects null, undefined and empty strings', () => {
    assert.strictEqual(isWorkspaceScopedId('abc'), true);
    assert.strictEqual(isWorkspaceScopedId(''), false);
    assert.strictEqual(isWorkspaceScopedId(null), false);
    assert.strictEqual(isWorkspaceScopedId(undefined), false);
  });
});
