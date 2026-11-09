import io

# ---------------- estimate.tsx: queue failed calculate/approve, replay on load
p = "apps/mobile/app/(tabs)/estimate.tsx"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("""import { resolveWorkspace } from '../../src/lib/workspace';""",
"""import { resolveWorkspace } from '../../src/lib/workspace';
import { enqueueOperation, isNetworkError, replayQueue } from '../../src/lib/queue-runtime';""")

rep("""    setHouseholdId(resolved.workspaceId);
    const wsRes = await mobileApiClient.getWorkspace(resolved.workspaceId, 2025);
    if (wsRes.data) setWorkspace(wsRes.data);
    setLoading(false);
    setRefreshing(false);
  };""",
"""    setHouseholdId(resolved.workspaceId);
    const wsRes = await mobileApiClient.getWorkspace(resolved.workspaceId, 2025);
    if (wsRes.data) setWorkspace(wsRes.data);

    // MOB-4: replay anything queued while offline before showing the figures.
    try {
      await replayQueue(mobileApiClient);
    } catch {
      // replay is best-effort; the queue keeps its items for the next attempt
    }

    setLoading(false);
    setRefreshing(false);
  };""")

rep("""    if (res.data) {
      setCalcResult(res.data);
      await loadData();
    } else {
      Alert.alert('Calculation Failed', res.error?.message || 'Could not calculate tax');
    }
  };""",
"""    if (res.data) {
      setCalcResult(res.data);
      await loadData();
    } else if (isNetworkError(res.error?.message)) {
      // MOB-4: queue-first — the calculation is retried automatically once online.
      const queued = await enqueueOperation({
        kind: 'CALCULATE_TAX',
        workspaceId: workspace.id,
        dedupeKey: `calc:${workspace.id}`,
      });
      Alert.alert(
        'Queued',
        queued.ok
          ? 'You are offline. The calculation is queued and will run when the connection returns.'
          : 'You are offline, and this calculation is already queued.',
      );
    } else {
      Alert.alert('Calculation Failed', res.error?.message || 'Could not calculate tax');
    }
  };""")

rep("""    if (res.data) {
      Alert.alert('Return Approved', 'Your approval has been recorded on this version of the declaration.');
      await loadData();
    } else {
      Alert.alert('Approval Failed', res.error?.message || 'Could not record approval');
    }
  };""",
"""    if (res.data) {
      Alert.alert('Return Approved', 'Your approval has been recorded on this version of the declaration.');
      await loadData();
    } else if (isNetworkError(res.error?.message)) {
      const queued = await enqueueOperation({
        kind: 'APPROVE_RETURN',
        workspaceId: workspace.id,
        dedupeKey: `approve:${workspace.id}:${workspace.activeReturnVersion}`,
      });
      Alert.alert(
        'Queued',
        queued.ok
          ? 'You are offline. Your approval is queued and will be sent when the connection returns.'
          : 'You are offline, and this approval is already queued.',
      );
    } else {
      Alert.alert('Approval Failed', res.error?.message || 'Could not record approval');
    }
  };""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("estimate wired")
