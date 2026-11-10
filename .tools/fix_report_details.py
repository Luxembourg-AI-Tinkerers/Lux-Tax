import io

p = r"B:\B\tax-app\build-verification-2026-11-10.md"
raw = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
t = raw.replace("\r\n", "\n")

old = "added a monorepo config (`watchFolders` for `packages/`, symlinks enabled, `LUXTAX_PACKAGES_DIR` override for out-of-tree builds)"
new = "added a monorepo config (`watchFolders` for `packages/` only, `LUXTAX_PACKAGES_DIR` override for out-of-tree builds)"
assert t.count(old) == 1, "metro row"
t = t.replace(old, new, 1)

# The checklist at the end predates the green bundle.
old_check = """The outstanding \"final suite + typechecks + tracker + report\" item is closed: **820 unit tests**,
**59 API e2e** (rebuilt `luxtax_e2e`, 6 suites), three typechecks at 0, `next build` green, tracker
updated with this section, with the DS resolution and with the mobile limitation."""
new_check = """The outstanding \"final suite + typechecks + tracker + report\" item is closed: **826 unit tests**,
**67 API e2e** (8 suites, rebuilt `luxtax_e2e`), three typechecks at 0, `next build` green on six
routes, and **`apps/mobile` bundling for iOS and Android**. Tracker updated with this section, with the
DS resolution and with the mobile build."""
if t.count(old_check) == 1:
    t = t.replace(old_check, new_check, 1)
    print("checklist updated")
else:
    print("checklist text not found (left as is)")

io.open(p, "w", encoding="utf-8", newline=nl).write(t)
print("done")

# Encoding sanity for the characters that used to arrive mangled.
t2 = io.open(p, encoding="utf-8", newline="").read()
for marker in ("\u00c2", "\u00e2\u20ac"):
    print(repr(marker), t2.count(marker))
