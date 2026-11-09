import io
p = "gap-check-2026-11-08.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:60])
    s = s.replace(old, new)

rep("| R6 CIC 2026 | Mechanism implemented (`CicRules`, `cicForSalary`, engine + UI line, sourced warning); no table shipped because none is published. ACD newsletter 30.10.2026 confirms only a first constitutional vote | ✅ mechanism / table pending |",
    "| R6 CIC 2026 | Mechanism implemented **and gated**: `pendingMeasures.CIC_2026` records the source and the exact activation diff; returns 0 with a sourced warning; activation proven by test | ✅ gate |")

rep("| R7 Loi 8775 | Status verified 2026-11-08: still **not in force** (first vote 28.10.2026, entry expected November 2026). Current law applied; the change is a one-line package edit | ✅ verified |",
    "| R7 Loi 8775 | Current law applied; `pendingMeasures.EPARGNE_LOGEMENT_8775` plus a warning for subscribers over 40; activation (`savingsHousingYoungMaxAge: 200`) proven by test | ✅ gate |")

rep("**What is still genuinely not produced:** the *numbers* for the 2026 CIC and the loi 8775 switch — both need a legal text that does not exist yet. The mechanisms are implemented and tested: the CIC is a data table the moment it is published, and the épargne-logement change is one package field. Everything else is implemented, including the annex PDF and the migrations (applied, zero drift).",
    "**What is still genuinely not produced:** only the *published numbers* — the 2026 CIC monthly table and the loi 8775 Mémorial text. Neither exists on 2026-11-08 (ACD newsletter unchanged: first constitutional vote only). Both are gated in the rule package with their source and activation diff, and a test proves that flipping the gate produces the expected credit and cap. This is an external dependency, not unfinished code.")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
