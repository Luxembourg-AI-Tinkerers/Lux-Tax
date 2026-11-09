import io
p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("**Last updated:** 2026-11-08 · Phase 1–7 implemented · **43 tests passing** · **migrations applied to a live PostgreSQL 18.4 with zero drift** · gap check: `gap-check-2026-11-08.md`",
    "**Last updated:** 2026-11-08 · Phase 1–8 implemented · **44 tests passing (37 engine + 7 annex PDF)** · **migrations applied to PostgreSQL 18.4, zero drift** · gap check: `gap-check-2026-11-08.md`")

rep("""# both suites (43)
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts""",
"""# both suites (44)
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts""")

rep("# 36 engine golden tests", "# 37 engine golden tests")

rep("| R6 | CIC 2026 amounts | ⛔ | not published in a Mémorial text; engine warns |",
    "| R6 | CIC mechanism | ✅ | `CicRules` table + `cicForSalary()` + engine/UI line implemented; **no table shipped** because none is published — returns 0 with a sourced warning |")

rep("| R7 | Loi 8775 épargne-logement | ⛔ | not promulgated/pinned; 2025/2026 law applied |",
    "| R7 | Loi 8775 status | ✅ verified | still **not in force** on 2026-11-08 (first constitutional vote only); current law applied, change tracked |")

rep("""## Phase 7 — database migration executed (closes R9 / 2.9)""",
"""## Phase 8 — publication status of R6 / R7 (verified 2026-11-08)

Both remaining items need a legal text, not code. Their status was re-checked against
primary sources today:

**ACD newsletter of 30 October 2026** (impotsdirects.public.lu/fr/archive/newsletter/2026/nl301020261.html):

> « En date du 28 octobre 2026, la Chambre des députés a procédé au **premier vote constitutionnel** concernant le projet de loi N° 8775 … La mise en vigueur du présent texte de loi (après dispense de 2ème vote et publication officielle) est **attendue pour le mois de novembre 2026**. »

It lists the three measures: CISSM adaptation, **temporary reintroduction of CIC 2026**, and **suppression of the 40-year age limit for épargne-logement**.

**CIC.** The ACD A–Z page for *crédit d'impôt conjoncture salarié* is still the 2023 table (last updated 28 July 2023) — there is no published 2026 monthly table. The newsletter adds that CIC salarié and pensionné for **June–October 2026** are to be bonified in one instalment **by 31 December 2026**.

**What was implemented instead of guessing:**

| Piece | Where |
|---|---|
| `CicRules` (piecewise-linear monthly bands + flat top amount) | `rules/types.ts` |
| `cicForSalary()` — returns 0 when no table is in the package; below the first band; otherwise the exact band formula ×12 | `credits.ts` |
| Engine line, provenance `LIR-CIC`, UI row, and a sourced warning when the year has no table | `engine.ts`, `TaxCalculatorView` |
| Mechanism test with a **synthetic** table (explicitly not a legal table) plus the "no table ⇒ 0" case | `tax-engine.spec.ts` |

So the credit becomes a **package data change** the day the table is published — the
same pattern used for every other year-dependent amount. No 2023 number is reused for 2026.

**Épargne-logement.** Current 2025/2026 law is applied (€1,344 up to age 40, €672 above).
The 8775 suppression is *not* applied because the law is not in force; the tracker keeps it
as a one-line data change (`savingsHousingYoungMaxAge`) once the Mémorial text is out.

## Phase 7 — database migration executed (closes R9 / 2.9)""")

rep("""| 2026-11-08 | DB inspection (tables / enum / column) | ✅ 23 · 17 · `annexesJson` jsonb |""",
"""| 2026-11-08 | DB inspection (tables / enum / column) | ✅ 23 · 17 · `annexesJson` jsonb |
| 2026-11-08 | Combined run after CIC work | ✅ **44 / 44 pass** |""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
