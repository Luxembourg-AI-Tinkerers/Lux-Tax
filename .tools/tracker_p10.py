import io
p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("**Last updated:** 2026-11-08 · Phase 1–9 implemented · **47 tests passing (40 engine + 7 annex PDF)**",
    "**Last updated:** 2026-11-08 · Phase 1–9 implemented · **48 tests passing (41 engine + 7 annex PDF)**")

rep("# 40 engine golden tests", "# 41 engine golden tests")
rep("# both suites (47)", "# both suites (48)")

rep("| R6 | CIC + publication gate | ✅ | `CicRules` + `cicForSalary()` + engine/UI line; `pendingMeasures` records `CIC_2026` with its source and the exact activation diff; activation proven by test |",
    "| R6 | CIC + publication gate | ✅ | `CicRules` + `cicForSalary()` + engine/UI line + `pendingMeasures`; **safety gate**: a table transcribed from a bill returns 0 while the measure is `NOT_IN_FORCE` (tested both states) |")

rep("""| 2026-11-08 | Combined run after the publication gate | ✅ **47 / 47 pass** |""",
"""| 2026-11-08 | Combined run after the publication gate | ✅ **47 / 47 pass** |
| 2026-11-08 | Publication re-check (ACD newsletter · Chambre dossier 8775 · ACD CIC page) | ⛔ still unpublished: dossier shows only “Déposé 22.06.2026”; ACD CIC page still 2023 |
| 2026-11-08 | Combined run after the CIC safety gate | ✅ **48 / 48 pass** |""")

rep("""**External dependency — not code work:** the 2026 CIC monthly table and the loi 8775
Mémorial text. Watch sources: ACD newsletter archive
(`impotsdirects.public.lu/fr/archive/newsletter/2026/…`) and the Chambre dossier 8775.""",
"""**Safety gate added.** `cicForSalary()` now returns 0 whenever a table exists but the
`CIC_2026` measure is still `NOT_IN_FORCE`. This blocks the one realistic mistake — pasting
the bands from the *projet de loi* and paying them out before the law enters into force.
Both states are tested (0 while pending, 120 when flipped to `IN_FORCE`).

**Publication re-check, 2026-11-08 (three sources):**

| Source | Result |
|---|---|
| ACD newsletter 30.10.2026 | unchanged — first constitutional vote only; entry “attendue pour le mois de novembre 2026” |
| Chambre dossier 8775 (`chd.lu/fr/dossier/8775`) | activity list shows only **“22.06.2026 Déposé”** — no vote, no published text |
| ACD CIC 2026 page | not public (only the 2023 table exists; `/…-salarie-2026.html` is cookie-walled / absent) |

**External dependency — not code work:** the 2026 CIC monthly table and the loi 8775
Mémorial text. Nothing in this repository can close them; a fabricated table would be
worse than no table.""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
