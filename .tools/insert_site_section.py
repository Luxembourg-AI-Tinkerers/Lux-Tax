import io

section = io.open(r"B:\B\tax-app\tmp\site-e2e-section.md", encoding="utf-8", newline="").read()

p = r"B:\B\tax-app\implementation-tracker.md"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

marker = "## 2026-11-09 \u2014 tenth pass: the recorded residuals, closed"
assert s.count(marker) == 1, s.count(marker)

s = s.replace(marker, section.rstrip() + "\n\n---\n\n" + marker, 1)

# Header: record that the web app now builds and runs.
old_head = "Everything else is implemented and evidenced (**620 unit tests across 50 spec files, 53 API e2e\ntests across 6 suites, 13 migrations, zero drift** \u2014 all re-measured 2026-11-09)."
new_head = (
    "Everything else is implemented and evidenced (**620 unit tests across 50 spec files, 53 API e2e\n"
    "tests across 6 suites, 13 migrations, zero drift** \u2014 re-measured 2026-11-10). The web app now\n"
    "also **builds and runs**: `next build` produces six routes and a real browser pass covers\n"
    "register \u2192 facts \u2192 calculate \u2192 approve \u2192 package \u2192 assessment \u2192 invite (see the site-e2e section)."
)
assert s.count(old_head) == 1, s.count(old_head)
s = s.replace(old_head, new_head)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
