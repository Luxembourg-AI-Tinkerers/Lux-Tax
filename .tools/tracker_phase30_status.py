import io

p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

pairs = [
    (
        ">   Evidence: **373 / 373 tests**, `tsc` exit 0, 52 files syntax `ok`.",
        ">   Evidence: **384 / 384 tests**, `tsc` exit 0, 54 files syntax `ok`.",
    ),
    (
        ">   Both are gated in the rule package with their source and activation diff, and a test proves the\n"
        ">   activation. No number has been invented to close them.",
        ">   Both are gated in the rule package, and as of Phase 30 the gate is **executable**:\n"
        ">   `cicForMonthlySalary()` returns `NOT_IN_FORCE` instead of a silent `0`, and\n"
        ">   `checkPendingConsistency()` / `assertPendingConsistency()` reject a package that declares a\n"
        ">   measure in force without its data (or carries data for a measure not in force). An 11-test spec\n"
        ">   exercises the full four-edit activation against a *synthetic* clone, so the runbook is proven\n"
        ">   without publishing a figure that does not exist. No number has been invented to close them.",
    ),
]

for old, new in pairs:
    assert s.count(old) == 1, old[:60]
    s = s.replace(old, new, 1)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
