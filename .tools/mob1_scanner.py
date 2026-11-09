import io

# ---------- DocumentCameraScanner: upload to a workspace, not a household
p = "apps/mobile/src/components/DocumentCameraScanner.tsx"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:80])
    s = s.replace(old, new)

rep("""interface DocumentCameraScannerProps {
  visible: boolean;
  householdId: string;
  taxYear: number;""",
"""interface DocumentCameraScannerProps {
  visible: boolean;
  /** MOB-1: uploads are workspace-scoped; a household id must not be passed here. */
  workspaceId: string;
  taxYear: number;""")

rep("""  householdId,""", """  workspaceId,""")

rep("""      const res = await mobileApiClient.uploadDocument(householdId, taxYear, {""",
"""      const res = await mobileApiClient.uploadDocument(workspaceId, {""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("scanner patched")

# ---------- documents.tsx: pass the workspace id to the scanner
p2 = "apps/mobile/app/(tabs)/documents.tsx"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
s2 = raw2.replace("\r\n", "\n")

def rep2(old, new):
    global s2
    assert s2.count(old) == 1, (s2.count(old), old[:80])
    s2 = s2.replace(old, new)

rep2("""      {householdId && (
        <DocumentCameraScanner
          visible={scannerVisible}
          householdId={householdId}""",
"""      {workspaceId && (
        <DocumentCameraScanner
          visible={scannerVisible}
          workspaceId={workspaceId}""")

io.open(p2, "w", encoding="utf-8", newline="").write(s2.replace("\n", "\r\n"))
print("documents patched")
