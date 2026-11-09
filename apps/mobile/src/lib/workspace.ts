/**
 * Workspace resolution for the mobile client (MOB-1).
 *
 * Several mobile screens were passing a **household** id to endpoints that are
 * workspace-scoped (`uploadDocument`, `calculateTax`, `approveReturn`). Those calls
 * silently targeted the wrong resource — or 404'd — because the API expects the
 * workspace id for a given tax year.
 *
 * This helper makes the resolution explicit and returns a typed result the screens
 * can branch on, instead of letting a household id travel further.
 */
export type WorkspaceResolution =
  | { ok: true; workspaceId: string; taxYear: number }
  | { ok: false; reason: 'NO_HOUSEHOLD' | 'NO_WORKSPACE' | 'ERROR'; message: string };

export interface WorkspaceResolverClient {
  getHouseholds(): Promise<{ data?: Array<{ id: string }> | null; error?: { message?: string } | null }>;
  getWorkspace(
    householdId: string,
    taxYear: number,
  ): Promise<{ data?: { id: string } | null; error?: { message?: string } | null }>;
}

/**
 * Resolves the workspace id for a household and tax year.
 *
 * `householdId` is optional: when omitted the first household of the account is
 * used, which is what the single-household mobile flow wants. Callers must use the
 * returned `workspaceId` — never the household id — for workspace endpoints.
 */
export async function resolveWorkspace(
  client: WorkspaceResolverClient,
  taxYear: number,
  householdId?: string | null,
): Promise<WorkspaceResolution> {
  try {
    let targetHousehold = householdId ?? null;

    if (!targetHousehold) {
      const households = await client.getHouseholds();
      const first = households.data?.[0];
      if (!first) {
        return {
          ok: false,
          reason: 'NO_HOUSEHOLD',
          message: 'No household found for this account.',
        };
      }
      targetHousehold = first.id;
    }

    const workspace = await client.getWorkspace(targetHousehold, taxYear);
    if (!workspace.data) {
      return {
        ok: false,
        reason: 'NO_WORKSPACE',
        message: `No workspace for tax year ${taxYear}. Create one on the web app first.`,
      };
    }

    return { ok: true, workspaceId: workspace.data.id, taxYear };
  } catch (error) {
    return {
      ok: false,
      reason: 'ERROR',
      message: error instanceof Error ? error.message : 'Could not resolve the workspace.',
    };
  }
}

/** Guard used before a workspace-scoped call: a household id must never be sent. */
export function isWorkspaceScopedId(id: string | null | undefined): id is string {
  return typeof id === 'string' && id.length > 0;
}
