import io
p = "apps/mobile/app/(tabs)/tasks.tsx"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:80])
    s = s.replace(old, new)

rep("""import { mobileApiClient } from '../../src/lib/api-client';
import { WorkspaceReadinessDto, TaskSeverity } from '@luxtax/contracts';""",
"""import { mobileApiClient } from '../../src/lib/api-client';
import { resolveWorkspace } from '../../src/lib/workspace';
import { WorkspaceReadinessDto, TaskSeverity } from '@luxtax/contracts';""")

rep("""  const [householdId, setHouseholdId] = useState<string | null>(null);""",
"""  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);""")

rep("""      const readRes = await mobileApiClient.getWorkspaceReadiness(hId, 2025);
      if (readRes.data) setReadiness(readRes.data);""",
"""      // Readiness is household-scoped, the questionnaire is workspace-scoped
      // (MOB-1/MOB-2): resolve both so no id crosses over.
      const resolved = await resolveWorkspace(mobileApiClient, 2025, hId);
      if (resolved.ok) setWorkspaceId(resolved.workspaceId);

      const readRes = await mobileApiClient.getWorkspaceReadiness(hId, 2025);
      if (readRes.data) setReadiness(readRes.data);""")

rep("""  const handleResolveQuestionnaire = async () => {
    if (!householdId) return;
    setLoading(true);
    await mobileApiClient.submitTaxProfile(householdId, 2025, {
      taxResidence: 'RESIDENT',
      maritalStatus: 'MARRIED',
      hasChildren: false,
      dependantsCount: 0,
      hasEmploymentIncome: true,
      hasPensionIncome: false,
      hasRentalIncome: false,
      hasPrimaryResidenceMortgage: true,
      mortgageOccupancyYear: 2025,
      hasInsuranceDeductions: true,
    });
    await loadData();
    Alert.alert('Profile Saved', 'Household questionnaire has been updated.');
  };""",
"""  const handleResolveQuestionnaire = async () => {
    if (!workspaceId) {
      Alert.alert('No workspace', 'Open or create a tax workspace for 2025 first.');
      return;
    }

    setLoading(true);
    // `submitTaxProfile` never existed on the client; the questionnaire endpoint is
    // workspace-scoped and expects the current QuestionnaireAnswersDto shape.
    const res = await mobileApiClient.saveQuestionnaire(workspaceId, {
      maritalStatus: 'MARRIED',
      hasEmploymentIncome: true,
      hasPensionIncome: false,
      hasPrimaryResidenceMortgage: true,
      hasLifeInsuranceOrPensionPlan: false,
      hasDonations: false,
      childrenCount: 0,
      hasFreelanceIncome: false,
    });
    setLoading(false);

    if (res.error) {
      Alert.alert('Save Failed', res.error.message || 'Could not save the questionnaire.');
      return;
    }

    await loadData();
    Alert.alert('Profile Saved', 'Household questionnaire has been updated.');
  };""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("tasks patched")
