import io

p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

old_prefix = "**Last updated:** 2026-11-09 (eighth pass"
start = s.find(old_prefix)
assert start != -1
end = s.find("\n", start)
old_line = s[start:end]

new_line = (
    "**Last updated:** 2026-11-09 · Phases 0–31 implemented · **395 tests passing** across "
    "**28 spec files** · **8 Prisma migrations applied to PostgreSQL 18.4, `migrate diff` empty "
    "(zero drift)** · `tsc -p tsconfig.test.json` exit 0 · 55 files syntax `ok` · "
    "**API e2e and a React Native build are NOT run** in this environment (mobile renderers are "
    "mounted through a `react-native` primitive shim — see Phase 31) · "
    "**R6/R7 blocked on projet de loi 8775** · gap check: `gap-check-2026-11-08.md`"
)

s = s[:start] + new_line + s[end:]
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("replaced:", old_line[:70], "...")
