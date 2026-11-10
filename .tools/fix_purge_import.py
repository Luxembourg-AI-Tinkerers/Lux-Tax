import io

p = r"B:\B\tax-app\apps\api\test\account-lifecycle.e2e-spec.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
t = raw.replace("\r\n", "\n")

old = "import { purgeAuditEvents } from './support/audit-purge';\n"
new = "import { purgeAuditEvents, purgeAuditEventsByEmail } from './support/audit-purge';\n"
assert t.count(old) == 1, "import"
t = t.replace(old, new, 1)

io.open(p, "w", encoding="utf-8", newline=nl).write(t)
print("import updated")
