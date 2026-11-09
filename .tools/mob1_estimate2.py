import io
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
      if (resolved.reason === 'NO_HOUSEHOLD') {
        Alert.alert('No household', resolved.message);
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

# DTO field alignment (the screen still used pre-2025 field names)
s = s.replace("calcResult.totalGrossIncome", "calcResult.grossIncome")
s = s.replace("calcResult.solidaritySurcharge)", "calcResult.solidaritySurchargeAmount)")
s = s.replace("calcResult.totalTaxLiability", "calcResult.finalTaxLiability")
s = s.replace("calcResult.withholdingTaxPaid", "calcResult.taxWithheldAtSource")
s = s.replace("Number(p.amount).toFixed(2)", "Number(p.outputAmount).toFixed(2)")
s = s.replace("Rule: {p.ruleCode} ({p.category})", "Rule: {p.ruleCode}")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("estimate patched")
