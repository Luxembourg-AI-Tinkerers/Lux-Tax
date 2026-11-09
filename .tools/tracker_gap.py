import io
p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:60])
    s = s.replace(old, new)

rep("**Last updated:** 2026-11-08 · Phase 1–4 implemented · 32 golden tests passing",
    "**Last updated:** 2026-11-08 · Phase 1–4 implemented · 33 golden tests passing · gap check: `gap-check-2026-11-08.md`")

rep("""| **2025** | `2025.1.0` | ✅ fully supported — 111bis €3,200, CI-CO2 €192, no AMVP, no start-up credit, Art. 118 2025 tariff |""",
"""| **2025** | `2025.1.0` | ✅ fully supported and the **default** — 111bis €3,200, CI-CO2 €192, no AMVP, no start-up credit, Art. 118 2025 tariff, filing until 31 Dec 2026 |""")

rep("""# 32 golden tests (ACD-checked values + 2025/2026 divergence + treaties + plus-values)""",
"""# 33 golden tests (ACD-checked values + 2025/2026 divergence + treaties + plus-values + CISSM)""")

rep("""| 1.4.2 | Capital income + €1,500 tranche + Art. 115(15a) 50 % | ✅ | `qualifyingDividend` fact key |""",
"""| 1.4.2 | Capital income + €1,500 tranche + Art. 115(15a) 50 % | 🟡 | `qualifyingDividend` fact key; no securities ledger, no RELIBI 20 % final option (gap R1) |""")

rep("""| 1.4.3 | Rental: net, 35 % / €2,700 forfait, social 90 % | ✅ | tested (€20,000 gross → €17,300 net) |""",
"""| 1.4.3 | Rental: net, 35 % / €2,700 forfait, social 90 % | 🟡 | tested (€20,000 gross → €17,300 net); no amortisation schedule or asset register (gap R2) |""")

rep("""| 1.5.5 | Two 90 % tests (Art. 3 d) / Art. 157ter) | ✅ | `professionalShareInLuxembourg` vs `worldwideShare` |""",
"""| 1.5.5 | Two 90 % tests (Art. 3 d) / Art. 157ter) | 🟡 | both shares computed and the 157ter gate enforced; the Art. 3 d) gate is reported but not used to flip a mixed couple (gap R3) |""")

rep("""| 4.1 | Decimal arithmetic end-to-end | ✅ | integer cents in `money.ts`, tariff, deductions, credits, fonds |""",
"""| 4.1 | Decimal arithmetic end-to-end | 🟡 | integer cents in `money.ts`, tariff slices, rates, deduction totals, credits and fonds; aggregates/DTOs remain `number` (gap R10) |""")

rep("""| 2.9 | Prisma migration for the enum values | ✅ | `apps/api/prisma/migrations/20261108120000_add_fact_category_values/` + `migration_lock.toml`; apply with `prisma migrate dev` (see runbook) |""",
"""| 2.9 | Prisma migration for the enum values | 🟡 | file committed (`…/20261108120000_add_fact_category_values/`) but **not executed** — no database here (gap R9) |
| 2.10 | CISSM crédit d'impôt salaire social minimum | ✅ | rule block, `cissmForSalary`, engine line, UI row, test |
| 2.11 | Facts UI exposes every legal fact type | ✅ | 22 presets incl. 111bis, MORTGAGE_INTEREST, LRCP, CE, capital, rental, foreign |""")

rep("""| 4.11 | Art. 114 multi-year loss ledger | ✅ | `lossCarryForward[{year, amount}]`, 17-year filter |""",
"""| 4.11 | Art. 114 multi-year loss ledger | ✅ | `lossCarryForward[{year, amount}]`, 17-year filter |
| 4.12 | Document extractor breadth | 🟡 | 111bis split from Art. 111; still only codes 101/103/105, no modèle 170 (gap R5) |""")

rep("""| 2026-11-08 | Golden tests | ✅ **32 / 32 pass** |""",
"""| 2026-11-08 | Golden tests | ✅ **33 / 33 pass** |""")

# add gap-check section before "## Known limitations"
rep("""## Known limitations (by design, not pending work)""",
"""## Gap check (2026-11-08)

Full audit in [`gap-check-2026-11-08.md`](gap-check-2026-11-08.md). Four material gaps were found where the engine was right but the app could not reach it — all fixed:

1. Facts UI still emitted the old `INSURANCE_DEDUCTION / pension111bis` shape → 111bis capped at €672.
2. Questionnaire lacked invalidity, épargne-logement age, 111bis contributors, child allocations, plus-values and the treaty row.
3. The document extractor routed *prévoyance* into the €672 envelope.
4. CISSM had no implementation at all.

Remaining partials, with reasons: R1 securities ledger, R2 rental asset register, R3 Art. 3 d) gate, R4 2028 transition, R5 extractor breadth, R6 CIC 2026, R7 loi 8775, R8 annex PDFs, R9 migration execution, R10 aggregate precision.

## Known limitations (by design, not pending work)""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("tracker updated")
