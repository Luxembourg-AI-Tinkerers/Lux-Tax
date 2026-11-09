import io
p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("""## Phase 15 — API-7: filing-package hash is no longer overwritten""",
"""## Phase 16 — API-9: calculation history is persisted

**Defect.** `TaxYearWorkspace.calculationResult` held only the latest result, so every
recalculation replaced the previous figures. The path from a draft to the filed number could
not be audited, and a disputed figure had no trace.

| Piece | Where | Behaviour |
|---|---|---|
| Model | `CalculationSnapshot` (`calculation_snapshots`) | `workspaceId`, `taxYear`, `taxClass`, `rulePackageVersion`, `resultSha256`, `resultJson`, `createdById`, `createdAt`; cascade on workspace, index `(workspaceId, createdAt)` |
| Canonical hash | `calculation-history.ts` `canonicalJson()` / `hashCalculationResult()` | keys sorted recursively before hashing, so two identical results always hash the same; array order still matters |
| Summary | `summariseCalculation()` | tolerant extraction of `taxableIncome`, `finalTaxLiability`, `balancePayableOrRefund`, `calculatedAt` from a stored row |
| Service | `calculations.service.ts` | writes a snapshot immediately before the workspace update that stores the latest result — same request, so the two cannot diverge |
| Migration | `20261109120000_add_calculation_snapshots` | table + index + FK |
| Tests | `apps/api/test/calculation-history.spec.ts` | 7 tests: key-order independence, array order, amount change changes the hash, hex SHA-256 shape, summary extraction, partial/empty result, `undefined` dropped consistently |

**Why the hash:** the snapshot is the audit trail, and a stored JSON blob alone cannot prove
it was not edited later. `resultSha256` is a stable anchor computed over a canonical form —
the same technique used for the filing package (API-7), so both artifacts are verifiable the
same way.

**Verified on the database:** migration applied to the 55433 cluster — **7 migrations** in
`_prisma_migrations`, `calculation_snapshots` present, `migrate diff` → `-- This is an empty
migration.` (no drift).

## Phase 15 — API-7: filing-package hash is no longer overwritten""")

rep("""| 2026-11-09 | Phase 15 — API-7 evidence index | ✅ **213 / 213 pass, 0 fail** (7 new tests) · migration 6 applied · `migrate diff` empty |""",
"""| 2026-11-09 | Phase 15 — API-7 evidence index | ✅ **213 / 213 pass, 0 fail** (7 new tests) · migration 6 applied · `migrate diff` empty |
| 2026-11-09 | Phase 16 — API-9 calculation history | ✅ **220 / 220 pass, 0 fail** (7 new tests) · migration 7 applied · `migrate diff` empty |""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
