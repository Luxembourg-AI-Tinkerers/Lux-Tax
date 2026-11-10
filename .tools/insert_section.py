import io

section = io.open(r"B:\B\tax-app\tmp\tracker-section.md", encoding="utf-8", newline="").read()

section = section.replace(
    "**620 / 620 tests** across **50 spec files**;",
    "**620 / 620 unit tests** across **51 spec files** and **53 / 53 API e2e tests** across **6 suites**;",
)
section = section.replace(
    "| API e2e | `pnpm install` links roughly 12 packages per minute in this environment and had not finished; `@nestjs/*` and the generated Prisma client were still absent when this section was written. The specs are transpiled and reviewed, never executed. |",
    "| ~~API e2e~~ | **Now run** — see \u201cThe API actually runs\u201d above. |",
)

p = r"B:\B\tax-app\implementation-tracker.md"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

marker = "## 2026-11-09 \u2014 ninth pass: every residual gap closed except R6 / R7"
assert s.count(marker) == 1, s.count(marker)

s = s.replace(marker, section.rstrip() + "\n\n---\n\n" + marker, 1)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
