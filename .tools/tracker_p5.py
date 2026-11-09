import io
p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:60])
    s = s.replace(old, new)

rep("**Last updated:** 2026-11-08 · Phase 1–4 implemented · 33 golden tests passing · gap check: `gap-check-2026-11-08.md`",
    "**Last updated:** 2026-11-08 · Phase 1–5 implemented · 36 golden tests passing · gap check: `gap-check-2026-11-08.md`")

rep("# 33 golden tests (ACD-checked values + 2025/2026 divergence + treaties + plus-values + CISSM)",
    "# 36 golden tests (ACD values + 2025/2026 divergence + treaties + plus-values + CISSM + securities + rental register + Art. 3 d)")

rep("| 1.4.2 | Capital income + €1,500 tranche + Art. 115(15a) 50 % | 🟡 | `qualifyingDividend` fact key; no securities ledger, no RELIBI 20 % final option (gap R1) |",
    "| 1.4.2 | Capital income + €1,500 tranche + Art. 115(15a) 50 % + RELIBI | ✅ | securities ledger: qualifying dividend, RELIBI 20 % final option, creditable foreign WHT |")

rep("| 1.4.3 | Rental: net, 35 % / €2,700 forfait, social 90 % | 🟡 | tested (€20,000 gross → €17,300 net); no amortisation schedule or asset register (gap R2) |",
    "| 1.4.3 | Rental: net, forfait, social 90 %, asset register | ✅ | amortisation 4 %/1.5 %/2 %/3 % + energy rate (6 % 2025 / 10 % 2026), charges, interest |")

rep("| 1.5.5 | Two 90 % tests (Art. 3 d) / Art. 157ter) | 🟡 | both shares computed and the 157ter gate enforced; the Art. 3 d) gate is reported but not used to flip a mixed couple (gap R3) |",
    "| 1.5.5 | Two 90 % tests (Art. 3 d) / Art. 157ter) | ✅ | Art. 3 d) gate now admits a mixed couple to Class 2 at ≥ 90 %, otherwise warns |")

rep("| 4.1 | Decimal arithmetic end-to-end | 🟡 | integer cents in `money.ts`, tariff slices, rates, deduction totals, credits and fonds; aggregates/DTOs remain `number` (gap R10) |",
    "| 4.1 | Decimal arithmetic end-to-end | ✅ | every money accumulation uses `addMoney` (cents); tariff, rates, deductions, credits, fonds in cents |")

rep("| 4.12 | Document extractor breadth | 🟡 | 111bis split from Art. 111; still only codes 101/103/105, no modèle 170 (gap R5) |",
    "| 4.12 | Document extractor breadth | ✅ | 111bis split, pension certificate (modèle 170) with code 200/201/203/205; other 160 codes still text-matched only |")

rep("""## Gap check (2026-11-08)""",
"""## Phase 5 — gap closure (R1–R10)

| Gap | Item | Status | Evidence |
|---|---|---|---|
| R10 | Exact money aggregation | ✅ | `addMoney`/`sumMoney`; 29 accumulation sites in `engine.ts` converted |
| R3 | Art. 3 d) mixed-couple gate | ✅ | `spouseResidence` + `mixedCoupleCollectiveRequested`; ≥ 90 % gate admits Class 2, otherwise warns |
| R5 | Extractor breadth | ✅ | dedicated 111bis branch + pension certificate (modèle 170) branch |
| R1 | Securities ledger | ✅ | qualifying dividend 50 %, RELIBI 20 % final, creditable foreign WHT, then the €1,500 tranche |
| R2 | Rental asset register | ✅ | 4 % recent (max 2 buildings) / 1.5 % / 2 % / 3 % by age + energy renovation rate, charges, interest |
| R8 | Annex production | ✅ | `annexes[]` (190/210, 700, 104, CIM request) persisted, rendered and printable; official ACD PDF not replicated |
| R4 | 2028 transition | ✅ | `classUTransition { years: 25, method: 'NONE' }` hook + explicit warning |
| R6 | CIC 2026 amounts | ⛔ | not published in a Mémorial text; engine warns |
| R7 | Loi 8775 épargne-logement | ⛔ | not promulgated/pinned; 2025/2026 law applied |
| R9 | Migration execution | ⛔ | no PostgreSQL in this environment; two migration folders committed |

## Gap check (2026-11-08)""")

rep("""| 2.10 | CISSM crédit d'impôt salaire social minimum | ✅ | rule block, `cissmForSalary`, engine line, UI row, test |""",
"""| 2.10 | CISSM crédit d'impôt salaire social minimum | ✅ | rule block, `cissmForSalary`, engine line, UI row, test |
| 2.12 | Securities + rental inputs in the questionnaire | ✅ | one-row entry each, mapped to `securities` / `rentalProperties` |""")

rep("""| 3.5 | Annexes 190/210, 700, 104 flagged | ✅ | sheet-level mapping, “not produced” |""",
"""| 3.5 | Annexes 190/210, 700, 104 | ✅ | `annexes[]` with values, reason, `produced: false`, UI card + Print / Save as PDF |""")

rep("| 2026-11-08 | Golden tests | ✅ **33 / 33 pass** |",
    "| 2026-11-08 | Golden tests | ✅ **36 / 36 pass** |")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
