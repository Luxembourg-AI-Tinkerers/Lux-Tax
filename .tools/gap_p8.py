import io
p = "gap-check-2026-11-08.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:60])
    s = s.replace(old, new)

rep("| R6 CIC 2026 | Not modelled — amounts not published; engine emits a warning | ⛔ blocked |",
    "| R6 CIC 2026 | Mechanism implemented (`CicRules`, `cicForSalary`, engine + UI line, sourced warning); no table shipped because none is published. ACD newsletter 30.10.2026 confirms only a first constitutional vote | ✅ mechanism / table pending |")

rep("| R7 Loi 8775 | 2025/2026 law applied (40-year limit); suppression not pinned | ⛔ blocked |",
    "| R7 Loi 8775 | Status verified 2026-11-08: still **not in force** (first vote 28.10.2026, entry expected November 2026). Current law applied; the change is a one-line package edit | ✅ verified |")

rep("**What is still genuinely not produced:** the 2026 CIC amounts (R6) and the loi 8775 épargne-logement change (R7) — both need a published legal text. Everything else in the audit's scope is implemented, including the annex PDF (a preparation sheet with an empty “case” column, not a clone of ACD artwork) and the migrations (applied, zero drift).",
    "**What is still genuinely not produced:** the *numbers* for the 2026 CIC and the loi 8775 switch — both need a legal text that does not exist yet. The mechanisms are implemented and tested: the CIC is a data table the moment it is published, and the épargne-logement change is one package field. Everything else is implemented, including the annex PDF and the migrations (applied, zero drift).")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
