import io
p = "apps/mobile/app/(tabs)/documents.tsx"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("""import { DocumentCameraScanner } from '../../src/components/DocumentCameraScanner';""",
"""import { DocumentCameraScanner } from '../../src/components/DocumentCameraScanner';
import { resolveWorkspace } from '../../src/lib/workspace';""")

rep("""  const [householdId, setHouseholdId] = useState<string | null>(null);
""", "")

rep("""      const hhRes = await mobileApiClient.getHouseholds();
      if (hhRes.data && hhRes.data.length > 0) {
        const hId = hhRes.data[0].id;
        setHouseholdId(hId);

        const wsRes = await mobileApiClient.getWorkspace(hId, 2025);
        if (wsRes.data) {
          const wId = wsRes.data.id;
          setWorkspaceId(wId);""",
"""      // MOB-1: every document call is workspace-scoped; resolve once here.
      const resolved = await resolveWorkspace(mobileApiClient, 2025);
      if (resolved.ok) {
        {
          const wId = resolved.workspaceId;
          setWorkspaceId(wId);""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
