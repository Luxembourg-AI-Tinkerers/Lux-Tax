"""Invitation acceptance and platform admin now require a verified address.

Each affected e2e suite gets two edits: import the helper, and verify the right
account immediately before the action that needs it. Minimal on purpose — the
suites' own assertions stay untouched.
"""
import io
import re

ROOT = r"B:\B\tax-app\apps\api\test"

IMPORT_ANCHOR = "import { purgeAuditEvents } from './support/audit-purge';"
IMPORT_LINE = "import { verifyEmailFor } from './support/verify-email';"


def patch(path, insertions):
    raw = io.open(path, encoding="utf-8-sig", newline="").read()
    nl = "\r\n" if "\r\n" in raw else "\n"
    s = raw.replace("\r\n", "\n")

    if "verify-email" not in s:
        assert s.count(IMPORT_ANCHOR) == 1, (path, "import anchor")
        s = s.replace(IMPORT_ANCHOR, IMPORT_ANCHOR + "\n" + IMPORT_LINE)

    for anchor, added in insertions:
        assert s.count(anchor) == 1, (path, anchor[:50], s.count(anchor))
        s = s.replace(anchor, added + anchor)

    io.open(path, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
    print("patched", path)


# household-collaboration: Bob must be verified before he accepts.
patch(
    ROOT + r"\household-collaboration.e2e-spec.ts",
    [(
        "  it('Step 7: Bob accepts the invitation to join the household', async () => {",
        "  it('Step 7: Bob accepts the invitation to join the household', async () => {\n"
        "    // Acceptance requires proof of the invited address.\n"
        "    await verifyEmailFor(app, bobEmail);\n",
    )],
)

# freelance-lifecycle: Bob accepts at step 5.
patch(
    ROOT + r"\freelance-lifecycle.e2e-spec.ts",
    [(
        "    // 5. Bob accepts invitation\n",
        "    // 5. Bob accepts invitation (his address must be verified first)\n"
        "    await verifyEmailFor(app, bobEmail);\n",
    )],
)

# tax-lifecycle-full: the spouse accepts.
patch(
    ROOT + r"\tax-lifecycle-full.e2e-spec.ts",
    [(
        "    // Spouse B accepts invitation\n",
        "    // The spouse's address must be proven before acceptance.\n"
        "    await verifyEmailFor(app, 'spouse.b@e2e.lu');\n\n"
        "    // Spouse B accepts invitation\n",
    )],
)

# admin-governance: the administrator needs a verified address too.
patch(
    ROOT + r"\admin-governance.e2e-spec.ts",
    [(
        "    process.env.ADMIN_EMAILS = uniqueEmail;",
        "    process.env.ADMIN_EMAILS = uniqueEmail;\n"
        "    // Platform administration requires a verified address, not just a match\n"
        "    // against the allowlist.\n"
        "    await verifyEmailFor(app, uniqueEmail);",
    )],
)

print("done")
