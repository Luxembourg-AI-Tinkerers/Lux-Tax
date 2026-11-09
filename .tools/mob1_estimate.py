import io

# ---------- estimate.tsx: resolve workspace, use workspace.id, align DTO fields
p = "apps/mobile/app/(tabs)/estimate.tsx"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("""import { mobileApiClient } from '../../src/lib/api-client';""",
"""import { mobileApiClient } from '../../src/lib/api-client';
import { resolveWorkspace } from '../../src/lib/workspace';""")

rep("""  const loadData = async () => {
    const hhRes = await mobileApiClient.getHouseholds();
    if (hhRes.data && hhRes.data.length > 0) {
      const hId = hhRes.data[0].id;
      setHouseholdId(hId);

      const wsRes = await mobileApiClient.getWorkspace(hId, 2025);
      if (wsRes.data) setWorkspace(wsRes.data);
    }
    setLoading(false);
    setRefreshing(false);
  };""",
"""  const loadData = async () => {
    // MOB-1: the workspace id — not the household id — identifies the return.
    const resolved = await resolveWorkspace(mobileApiClient, 2025);
    if (!resolved.ok) {
      setWorkspace(null);
      setHouseholdId(null);
      if (resolved.reason !== 'NO_WORKSPACE') {
        Alert.alert('Workspace unavailable', resolved.message);
      }
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setHouseholdId(resolved.workspaceId);
    const wsRes = await mobileApiClient.getWorkspace(resolved.workspaceId, 2025);
    if (wsRes.data) setWorkspace(wsRes.data);
    setLoading(false);
    setRefreshing(false);
  };""")

rep("""  const handleRunCalculation = async () => {
    if (!householdId) return;
    setCalculating(true);
    const res = await mobileApiClient.calculateTax(householdId, 2025);
    setCalculating(false);""",
"""  const handleRunCalculation = async () => {
    if (!workspace?.id) {
      Alert.alert('No workspace', 'Open or create a tax workspace for 2025 first.');
      return;
    }
    setCalculating(true);
    const res = await mobileApiClient.calculateTax(workspace.id);
    setCalculating(false);""")

rep("""  const handleApproveReturn = async () => {
    if (!householdId) return;
    setApproving(true);
    const res = await mobileApiClient.approveReturn(householdId, 2025);
    setApproving(false);""",
"""  const handleApproveReturn = async () => {
    if (!workspace?.id) {
      Alert.alert('No workspace', 'Open or create a tax workspace for 2025 first.');
      return;
    }
    setApproving(true);
    const res = await mobileApiClient.approveReturn(workspace.id);
    setApproving(false);""")

# DTO field alignment with the current contracts
rep("""  const balance = calcResult
    ? Number(calcResult.estimatedRefundOrBalance)
    : workspace?.estimatedTaxBalance
    ? Number(workspace.estimatedTaxBalance)
    : 0;

  const isRefund = balance > 0;""",
"""  // `balancePayableOrRefund` is positive when tax is due, negative when refunded.
  const balance = calcResult
    ? Number(calcResult.balancePayableOrRefund)
    : workspace?.estimatedTaxBalance
      ? Number(workspace.estimatedTaxBalance)
      : 0;

  const isRefund = balance < 0;""")

rep("""          {isRefund ? '+' : ''}€{Math.abs(balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}""",
"""          {isRefund ? '+' : ''}€{Math.abs(balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}""")

rep("""            <Text className="rowVal">€{Number(calcResult.totalGrossIncome).toFixed(2)}</Text>""",
"""            <Text style={styles.rowVal}>€{Number(calcResult.grossIncome).toFixed(2)}</Text>""")

rep("""            <Text className="rowVal">€{Number(calcResult.totalGrossIncome).toFixed(2)}</Text>""",
"""            <Text style={styles.rowVal}>€{Number(calcResult.grossIncome).toFixed(2)}</Text>""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("estimate patched")
