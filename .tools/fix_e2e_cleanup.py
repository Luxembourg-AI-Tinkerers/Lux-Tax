"""The e2e specs clean up by deleting audit rows, which API-10 makes impossible
by design: a database trigger rejects DELETE on `audit_events`. Every suite then
reported a failure in `afterAll` even when all its assertions passed.

The rows are append-only on purpose, so the cleanup is dropped rather than the
trigger. Audit rows reference the actor with ON DELETE SET NULL, so removing the
test users leaves harmless, unlinked history behind.
"""
import io
import glob
import os

files = glob.glob(r"B:\B\tax-app\apps\api\test\*.e2e-spec.ts")

MARKER = "await prisma.auditEvent.deleteMany("
COMMENT = (
    "// Audit rows are append-only (API-10): a trigger rejects DELETE, so no\n"
    "// cleanup is attempted here. Removing the user leaves them unlinked.\n"
)

changed = 0
for path in files:
    raw = io.open(path, encoding="utf-8-sig", newline="").read()
    nl = "\r\n" if "\r\n" in raw else "\n"
    s = raw.replace("\r\n", "\n")

    while True:
        start = s.find(MARKER)
        if start == -1:
            break
        # Walk from the opening parenthesis to its match, then to the semicolon.
        open_paren = s.index("(", start)
        depth = 0
        i = open_paren
        while i < len(s):
            if s[i] == "(":
                depth += 1
            elif s[i] == ")":
                depth -= 1
                if depth == 0:
                    break
            i += 1
        end = s.index(";", i) + 1
        # Preserve indentation of the original statement.
        line_start = s.rfind("\n", 0, start) + 1
        indent = s[line_start:start]
        replacement = COMMENT.replace("\n", "\n" + indent).rstrip() + "\n"
        s = s[:line_start] + indent + replacement + s[end:]
        changed += 1

    io.open(path, "w", encoding="utf-8", newline=nl).write(s.replace("\n", nl))

print("statements removed:", changed)
