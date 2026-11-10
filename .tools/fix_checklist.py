import io

p = r"B:\B\tax-app\build-verification-2026-11-10.md"
raw = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
t = raw.replace("\r\n", "\n")

old = (
    'The outstanding "final suite + typechecks + tracker + report" item is closed: **820 unit tests**,\n'
    "**59 API e2e** (7 suites, rebuilt `luxtax_e2e`, 17 migrations), three typechecks at 0, `next build`\n"
    "green, tracker updated with this section, with the DS resolution and with the mobile limitation."
)
new = (
    'The outstanding "final suite + typechecks + tracker + report" item is closed: **826 unit tests**,\n'
    "**67 API e2e** (8 suites, rebuilt `luxtax_e2e`, 19 migrations), three typechecks at 0, `next build`\n"
    "green on six routes, and **`apps/mobile` bundling for iOS and Android**. Tracker updated with this\n"
    "section, with the DS resolution and with the mobile build."
)
assert t.count(old) == 1, "checklist"
t = t.replace(old, new, 1)

io.open(p, "w", encoding="utf-8", newline=nl).write(t)
print("checklist updated")
