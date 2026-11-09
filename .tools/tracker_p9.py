import io
p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("**Last updated:** 2026-11-08 · Phase 1–8 implemented · **44 tests passing (37 engine + 7 annex PDF)** · **migrations applied to PostgreSQL 18.4, zero drift** · gap check: `gap-check-2026-11-08.md`",
    "**Last updated:** 2026-11-08 · Phase 1–9 implemented · **47 tests passing (40 engine + 7 annex PDF)** · **migrations applied to PostgreSQL 18.4, zero drift** · gap check: `gap-check-2026-11-08.md`")

rep("# 37 engine golden tests", "# 40 engine golden tests")
rep("# both suites (44)", "# both suites (47)")

rep("| R6 | CIC mechanism | ✅ | `CicRules` table + `cicForSalary()` + engine/UI line implemented; **no table shipped** because none is published — returns 0 with a sourced warning |",
    "| R6 | CIC + publication gate | ✅ | `CicRules` + `cicForSalary()` + engine/UI line; `pendingMeasures` records `CIC_2026` with its source and the exact activation diff; activation proven by test |")

rep("| R7 | Loi 8775 status | ✅ verified | still **not in force** on 2026-11-08 (first constitutional vote only); current law applied, change tracked |",
    "| R7 | Épargne-logement gate | ✅ | current law applied; `EPARGNE_LOGEMENT_8775` pending measure + a warning for subscribers over 40; activation proven by test |")

rep("""## Phase 8 — publication status of R6 / R7 (verified 2026-11-08)""",
"""## Phase 9 — publication gate (R6 / R7 as data switches)

Re-checked on 2026-11-08: the ACD newsletter of 30.10.2026 is **unchanged** — only the
*premier vote constitutionnel* (28.10.2026) has happened, and entry into force is still
“attendue pour le mois de novembre 2026”. The ACD CIC page still carries the 2023 table.
No 2026 table and no Mémorial text exist yet, so no number may be shipped.

Instead of leaving the two items as “unimplemented”, the package now carries an explicit
gate:

```ts
// packages/tax-engine/src/rules/2026.ts
pendingMeasures: [
  { id: 'CIC_2026', status: 'NOT_IN_FORCE',
    source: 'Projet de loi 8775 (1er vote 28.10.2026); ACD newsletter 30.10.2026 …',
    activation: 'add cic: { bands: [...], topAmount: … } with the published monthly table' },
  { id: 'EPARGNE_LOGEMENT_8775', status: 'NOT_IN_FORCE',
    source: 'Projet de loi 8775 — suppression of the 40-year age limit',
    activation: 'set specialExpenses.savingsHousingYoungMaxAge to 200' },
]
```

Behaviour today:

| Situation | Result |
|---|---|
| 2026 salary, no table | CIC = 0, warning naming the source and the activation step |
| Épargne-logement, subscriber 45 | capped at €672, warning that 8775 would remove the age limit |
| `pendingMeasures` on 2025 | absent |

**Activation is proven, not assumed.** A test builds a package with
`savingsHousingYoungMaxAge: 200` and a CIC table, then asserts
`calculateDeductions().savingsHousingDeduction === 1 344` and `cicForSalary(60 000) === 120`.
So when the Mémorial publishes, the whole change is:

1. paste the published `bands` into `rules/2026.ts` as `cic`;
2. set `savingsHousingYoungMaxAge` to `200`;
3. flip both `pendingMeasures[].status` to `'IN_FORCE'`;
4. run the suite and update this file.

**External dependency — not code work:** the 2026 CIC monthly table and the loi 8775
Mémorial text. Watch sources: ACD newsletter archive
(`impotsdirects.public.lu/fr/archive/newsletter/2026/…`) and the Chambre dossier 8775.

## Phase 8 — publication status of R6 / R7 (verified 2026-11-08)""")

rep("""| 2026-11-08 | Combined run after CIC work | ✅ **44 / 44 pass** |""",
"""| 2026-11-08 | Combined run after CIC work | ✅ **44 / 44 pass** |
| 2026-11-08 | Combined run after the publication gate | ✅ **47 / 47 pass** |""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
