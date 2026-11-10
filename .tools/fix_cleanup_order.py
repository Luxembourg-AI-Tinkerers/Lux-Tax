import io

# Both suites delete a workspace before purging audit rows; the delete cascades
# into audit_events and the API-10 trigger rejects it. Purge first.
edits = [
    (
        r"B:\B\tax-app\apps\api\test\receipt-scanning.e2e-spec.ts",
        """    if (prisma && userId) {
      if (workspaceId) {
        await prisma.extractedFact.deleteMany({ where: { workspaceId } });""",
        """    if (prisma && userId) {
      // Purge the actor's audit rows first: deleting the workspace cascades into
      // audit_events, which the API-10 trigger rejects unless the session opts in.
      await purgeAuditEvents(prisma, [userId]);
      if (workspaceId) {
        await prisma.extractedFact.deleteMany({ where: { workspaceId } });""",
    ),
    (
        r"B:\B\tax-app\apps\api\test\freelance-lifecycle.e2e-spec.ts",
        """        await prisma.taxYearWorkspace.deleteMany({ where: { id: workspaceId } });""",
        """        // Audit rows are append-only and cascade from the workspace, so they are
        // purged first (inside the transaction that opts the trigger out).
        await purgeAuditEvents(prisma, userIds);
        await prisma.taxYearWorkspace.deleteMany({ where: { id: workspaceId } });""",
    ),
]

for path, old, new in edits:
    raw = io.open(path, encoding="utf-8-sig", newline="").read()
    nl = "\r\n" if "\r\n" in raw else "\n"
    s = raw.replace("\r\n", "\n")
    assert s.count(old) == 1, (path, s.count(old))
    s = s.replace(old, new)
    io.open(path, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
    print("patched", path)
