"""Wire the guarded audit purge back into the e2e cleanup blocks.

Each spec resolved the test users, then deleted workspaces/households. Those
deletes cascade into `audit_events`, which the API-10 trigger rejects, so the
cleanup threw. Purging the audit rows of the test actors first — inside a
transaction that opts in — lets the rest of the cleanup run.
"""
import io
import glob
import re

files = sorted(glob.glob(r"B:\B\tax-app\apps\api\test\*.e2e-spec.ts"))

for path in files:
    raw = io.open(path, encoding="utf-8-sig", newline="").read()
    if "purgeAuditEvents" in raw:
        continue
    nl = "\r\n" if "\r\n" in raw else "\n"
    s = raw.replace("\r\n", "\n")

    # 1. Add the import after the PrismaService import.
    anchor = "import { PrismaService } from '../src/prisma/prisma.service';"
    if s.count(anchor) != 1:
        print("SKIP (no prisma import)", path)
        continue
    s = s.replace(
        anchor,
        anchor + "\nimport { purgeAuditEvents } from './support/audit-purge';",
    )

    # 2. Place the purge right after the actor ids are known.
    if "const userIds = users.map((u) => u.id);" in s:
        s = s.replace(
            "const userIds = users.map((u) => u.id);",
            "const userIds = users.map((u) => u.id);\n"
            "      // Audit rows are append-only; purge the test actors' rows inside\n"
            "      // an opted-in transaction so the rest of the cleanup can run.\n"
            "      await purgeAuditEvents(prisma, userIds);",
        )
    else:
        # admin-governance and others use a single id per block.
        s = re.sub(
            r"await prisma\.auditEvent\.deleteMany\(\{ where: \{ actorId: (\w+) \} \}\);",
            r"await purgeAuditEvents(prisma, [\1]);",
            s,
        )

    io.open(path, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))

print("done")
