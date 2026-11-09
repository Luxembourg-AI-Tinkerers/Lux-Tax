import io
p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("**Last updated:** 2026-11-08 · Phase 1–6 implemented · **43 tests passing (36 engine + 7 annex PDF)** · gap check: `gap-check-2026-11-08.md`",
    "**Last updated:** 2026-11-08 · Phase 1–7 implemented · **43 tests passing** · **migrations applied to a live PostgreSQL 18.4 with zero drift** · gap check: `gap-check-2026-11-08.md`")

rep("""Database step (requires a running PostgreSQL):

```powershell
pnpm --filter @luxtax/api prisma:generate
pnpm --filter @luxtax/api prisma:migrate
```""",
"""Database step — **executed in this session** against a throwaway PostgreSQL 18.4 cluster:

```powershell
# cluster created inside .tools (no change to the installed service)
& "C:\\Program Files\\PostgreSQL\\18\\bin\\initdb.exe" -D .tools\\pgdata -U postgres -A trust -E UTF8 --locale=C
& "C:\\Program Files\\PostgreSQL\\18\\bin\\pg_ctl.exe" -D .tools\\pgdata -l .tools\\pg.log -o "-p 55432" start
& "C:\\Program Files\\PostgreSQL\\18\\bin\\createdb.exe" -h 127.0.0.1 -p 55432 -U postgres luxtax

$env:DATABASE_URL='postgresql://postgres@127.0.0.1:55432/luxtax?schema=public'
node .tools/node_modules/prisma/build/index.js migrate deploy --schema <schema-with-url>
```

In a normal workspace (deps installed) the same step is `pnpm --filter @luxtax/api prisma:migrate`.""")

rep("| 2.9 | Prisma migration for the enum values | 🟡 | file committed (`…/20261108120000_add_fact_category_values/`) but **not executed** — no database here (gap R9) |",
    "| 2.9 | Prisma migrations executed | ✅ | 3 migrations applied to PostgreSQL 18.4; 23 tables; `FactCategory` = 17 values; `filing_packages.annexesJson` jsonb; `migrate diff` = **empty** (no drift) |")

rep("| R9 | Migration execution | ⛔ | no PostgreSQL in this environment; two migration folders committed |",
    "| R9 | Migration execution | ✅ | applied and verified — see Phase 7 |")

rep("""## Phase 6 — annex PDF generation""",
"""## Phase 7 — database migration executed (closes R9 / 2.9)

A throwaway PostgreSQL 18.4 cluster was initialised inside `.tools/pgdata` on port
**55432** with `trust` auth, so the machine's existing `postgresql-x64-18` service and
its credentials were left untouched.

**Baseline problem found and fixed.** The repository had no initial migration, only the
two delta folders — applying them to an empty database would fail on a missing
`FactCategory` type. A baseline was generated from the *pre-change* model with
`prisma migrate diff --from-empty --to-schema-datamodel`, giving a coherent history:

| Migration | Content |
|---|---|
| `20261108000000_init` | full baseline schema from the pre-change model (23 tables, 9-value `FactCategory`) |
| `20261108120000_add_fact_category_values` | the 8 new `FactCategory` values |
| `20261108130000_add_filing_annexes` | `filing_packages."annexesJson"` |

**Two real defects caught by running it:**

1. `migration_lock.toml` and the migration SQL files were written with a **UTF-8 BOM** by PowerShell, which PostgreSQL rejected (`syntax error at or near "\ufeff"`). Stripped — files are now UTF-8 without BOM.
2. The annexes migration added `"annexes_json"` while the Prisma model maps to `"annexesJson"` (no `@map`). `prisma migrate diff` reported drift; the migration was corrected and the database rebuilt from scratch.

**Verification after rebuild**

```
Applying migration `20261108000000_init`
Applying migration `20261108120000_add_fact_category_values`
Applying migration `20261108130000_add_filing_annexes`
All migrations have been successfully applied.

_prisma_migrations: 3 rows, all finished_at not null
tables in schema public: 23
FactCategory enum values: 17 (9 original + 8 added)
filing_packages."annexesJson": jsonb
migrate diff --from-url … --to-schema-datamodel … --script  →  "-- This is an empty migration."   (NO DRIFT)
```

**Not done, for a stated reason:** `prisma generate` still needs the workspace install
(`pnpm install`). It resolves `@prisma/client` from the package tree, and this environment
has no `node_modules`; Prisma's fallback (`pnpm add prisma -D`) cannot run against a
`workspace:*` root. Regenerating the client is therefore a post-install step, not a
migration step.

Restart the cluster later with:

```powershell
& "C:\\Program Files\\PostgreSQL\\18\\bin\\pg_ctl.exe" -D .tools\\pgdata -l .tools\\pg.log -o "-p 55432" start
```

## Phase 6 — annex PDF generation""")

rep("""| 2026-11-08 | Combined run | ✅ **43 / 43 pass** |""",
"""| 2026-11-08 | Combined run | ✅ **43 / 43 pass** |
| 2026-11-08 | `prisma migrate deploy` on PostgreSQL 18.4 | ✅ 3 / 3 applied |
| 2026-11-08 | `prisma migrate diff` DB vs model | ✅ **empty — no drift** |
| 2026-11-08 | DB inspection (tables / enum / column) | ✅ 23 · 17 · `annexesJson` jsonb |""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
