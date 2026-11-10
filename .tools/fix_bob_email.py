import io

p = r"B:\B\tax-app\apps\api\test\household-collaboration.e2e-spec.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

s = s.replace(
    "await verifyEmailFor(app, bobEmail);",
    "await verifyEmailFor(app, 'bob.e2e@example.lu');",
)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
