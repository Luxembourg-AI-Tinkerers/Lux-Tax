import io

# 1. household-collaboration: remove the duplicated `it(` line from my insertion.
p = r"B:\B\tax-app\apps\api\test\household-collaboration.e2e-spec.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

broken = """  it('Step 7: Bob accepts the invitation to join the household', async () => {
    // Acceptance requires proof of the invited address.
    await verifyEmailFor(app, bobEmail);
  it('Step 7: Bob accepts the invitation to join the household', async () => {"""
fixed = """  it('Step 7: Bob accepts the invitation to join the household', async () => {
    // Acceptance requires proof of the invited address.
    await verifyEmailFor(app, bobEmail);"""

assert s.count(broken) == 1, s.count(broken)
s = s.replace(broken, fixed)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("repaired household-collaboration")

# 2. admin-governance: verify the ordinary user too, so the assertion still tests
#    the allowlist rather than the verification gate.
p = r"B:\B\tax-app\apps\api\test\admin-governance.e2e-spec.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

old = "    process.env.ADMIN_EMAILS = uniqueEmail;"
idx = s.index(old)
end_of_test = s.index("  });", idx)
insert_at = end_of_test
s = (
    s[:insert_at]
    + "    // An unverified account would be refused for the other reason; verify it so\n"
    + "    // the assertion below is about the allowlist.\n"
    + "    await verifyEmailFor(app, ordinaryEmail);\n"
    + s[insert_at:]
)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("patched admin-governance")
