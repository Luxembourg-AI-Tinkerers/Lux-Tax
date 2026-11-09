import io
p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("""## Phase 16 — API-9: calculation history is persisted""",
"""## Phase 17 — API-10: audit trail is immutable and classified

**Defect.** `audit_events` was append-only by convention. Any process with database access
could rewrite a description or delete a row, and nothing linked one event to the next, so
tampering left no trace. Event types were also a flat enum with no grouping.

| Piece | Where | Behaviour |
|---|---|---|
| Hash chain | `apps/api/src/modules/audit/audit-chain.ts` | `hashAuditEvent(prevHash, event)` over a canonical form including `id`, `createdAt` and the previous hash; `verifyAuditChain()` reports `brokenAt` + reason |
| Taxonomy | same, `auditCategory()` | prefix map to `AUTH / HOUSEHOLD / DOCUMENT / FACT / CALCULATION / FILING / ADMIN`; unknown types fall back to `ADMIN` rather than throwing |
| Service | `audit.service.ts` | reads the last hashed event for the household, then writes `prevHash` + `hash` with the row |
| Schema | `AuditEvent.prevHash` / `hash` + `@@index([householdId, hash])` | chain is per household — the tenant boundary a reviewer reads as one narrative |
| Migration | `20261109130000_add_audit_chain` | columns, index, **and a trigger** `audit_events_no_update_delete` that raises on UPDATE/DELETE |
| Tests | `apps/api/test/audit-chain.spec.ts` | 8 tests: valid chain, edited event, deleted event, re-ordered pair, prev-hash dependence, canonical key order, full taxonomy table, unknown fallback |

**Two layers, on purpose:** the trigger *prevents* modification at the database, the chain
*detects* it if the trigger is ever dropped or bypassed (restore, replication, manual DDL).
Neither alone is sufficient — a hash chain cannot stop a delete, and a trigger cannot prove
the surviving rows are the ones originally written.

**Verified on the database:** migration 8 applied, `audit_events."prevHash"`/`"hash"` present,
trigger `audit_events_no_update_delete` installed, `migrate diff` → `-- This is an empty
migration.` (no drift).

## Phase 16 — API-9: calculation history is persisted""")

rep("""| 2026-11-09 | Phase 16 — API-9 calculation history | ✅ **220 / 220 pass, 0 fail** (7 new tests) · migration 7 applied · `migrate diff` empty |""",
"""| 2026-11-09 | Phase 16 — API-9 calculation history | ✅ **220 / 220 pass, 0 fail** (7 new tests) · migration 7 applied · `migrate diff` empty |
| 2026-11-09 | Phase 17 — API-10 audit chain | ✅ **228 / 228 pass, 0 fail** (8 new tests) · migration 8 applied · trigger installed · `migrate diff` empty |""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
