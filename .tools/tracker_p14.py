import io
p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("""## Phase 13 — LEG-9: no filing package from a preview package""",
"""## Phase 14 — API-6 was already delivered; the two pending migrations were not

Before implementing API-6 (filing record + objection dates) the repository was inspected,
and the item is **already implemented** by the parallel track:

- `FilingRecord` model (`filing_records`), `FilingRoute` enum, one record per workspace,
  `returnVersionId` `@unique` so a correction needs an amendment rather than a second record
- `Assessment.receivedAt` / `objectionDeadline` / `followUpAt` / `isFinal`
- `recordFiling` + `getFilingRecord` in `filing.service.ts`, `createFilingRecordSchema`,
  `FilingRecordDto`, controller routes, and `apps/api/test/assessment-dates.spec.ts`

Re-implementing it would have duplicated and probably conflicted with that work. What *was*
missing is that two authored migrations had **never been applied** — the database was two
revisions behind the schema, so the new tables did not exist anywhere.

| Migration | Content |
|---|---|
| `20261108140000_add_notifications` | `notifications`, `notification_preferences` |
| `20261109100000_add_filing_record` | `filing_records` |

Applied to a **fresh** PostgreSQL 18.4 cluster (the original `.tools/pgdata` postmaster on
port 55432 began failing to fork children with Windows error 487 — shared-memory address
conflict — so a new cluster was initialised at `.tools/pgdata2`, port 55433, `shared_buffers`
reduced to 32 MB):

```
Applying migration `20261108000000_init`
Applying migration `20261108120000_add_fact_category_values`
Applying migration `20261108130000_add_filing_annexes`
Applying migration `20261108140000_add_notifications`
Applying migration `20261109100000_add_filing_record`
All migrations have been successfully applied.
```

Verification:

| Check | Result |
|---|---|
| `_prisma_migrations` | 5 rows, in order |
| Tables in `public` | **26** (was 23) |
| New tables present | `filing_records`, `notifications`, `notification_preferences` |
| Assessment columns | `receivedAt`, `objectionDeadline`, `isFinal` present |
| `migrate diff --from-url … --to-schema-datamodel …` | `-- This is an empty migration.` → **no drift** |

The temporary `schema.deploy.prisma` used to supply `DATABASE_URL` (the committed
`schema.prisma` gets its URL from `prisma.config.ts`) was deleted afterwards; the cluster was
stopped, data kept at `.tools/pgdata2`.

**Consequence for the open table:** API-6 should not be listed as open — it was delivered
before this pass. The migration gap it left behind is what this phase closes.

## Phase 13 — LEG-9: no filing package from a preview package""")

rep("""| 2026-11-09 | Phase 13 — LEG-9 filing-year guard | ✅ **206 / 206 pass, 0 fail** (5 new tests); `tsc` exit 0; 45 files syntax `ok` |""",
"""| 2026-11-09 | Phase 13 — LEG-9 filing-year guard | ✅ **206 / 206 pass, 0 fail** (5 new tests); `tsc` exit 0; 45 files syntax `ok` |
| 2026-11-09 | Phase 14 — migrations 4 & 5 applied on a fresh cluster | ✅ 5 / 5 applied · 26 tables · `migrate diff` empty · API-6 found already delivered |""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
