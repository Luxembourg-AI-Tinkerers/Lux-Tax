import io
p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("""### Suite repair — the validation failure was a build gap, not a logic gap (2026-11-09)""",
"""## Phase 12 — prime jeune salarié (LEG-10, Art. 115 n° 13d)

LEG-10 was recorded as “not selected” by an earlier pass and left unimplemented. It is
the only remaining audit item whose law is **already published and in force**, so it was
taken instead of idling on the publication block.

| Piece | Where |
|---|---|
| Rule package | `rules/types.ts` `YoungEmployeePrimeRules`; `2025.ts` `exemptRate: 0.75` and bands `50 000 → 5 000`, `75 000 → 3 750`, `100 000 → 2 500` (2026 / 2028 inherit) |
| Engine | `engine.ts`: exemption = `min(prime × 75 %, band cap)`, gated on `youngEmployeePrimeEligible`, subtracted from the tax base, provenance `LIR-ART-115-13d`, warning above €100 000 |
| Contracts | `youngEmployeePrime`, `youngEmployeePrimeEligible`, result field `youngEmployeePrimeExemption` |
| Validation + API | questionnaire schema and `CalculationsService` passthrough |
| UI | questionnaire amount + eligibility select; calculator row |
| Tests | one test covering the three bands, the ineligible case and the €100 000 cut-off |

**Deliberate legal choices:** the exemption never reduces the CIS/CI-CO2 base (those are
computed on gross salary including exempt salary), and eligibility is an explicit input
because the exemption is lost on a change of employer — it cannot be inferred from age alone.

### Suite repair — the validation failure was a build gap, not a logic gap (2026-11-09)""")

rep("""| 2026-11-09 | **Suite repair — validation build** | ✅ **200 / 200 pass, 0 fail** across all 10 spec files |""",
"""| 2026-11-09 | **Suite repair — validation build** | ✅ **200 / 200 pass, 0 fail** across all 10 spec files |
| 2026-11-09 | Phase 12 — prime jeune salarié | ✅ **201 / 201 pass, 0 fail**; `tsc` exit 0; 45 files syntax `ok` |""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
