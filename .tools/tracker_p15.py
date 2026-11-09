import io
p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("""## Phase 14 — API-6 was already delivered; the two pending migrations were not""",
"""## Phase 15 — API-7: filing-package hash is no longer overwritten

**Defect.** `generateFilingPackage` upserted the package and overwrote `packageSha256` on
every regeneration. The hash of the version actually filed — the only proof of *what* was
generated — was lost, and nothing recorded earlier generations.

| Piece | Where | Behaviour |
|---|---|---|
| Evidence index | `apps/api/src/modules/filing/filing-package-evidence.ts` | `appendPackageEvidence()` marks the previous entry `supersededAt` and appends the new one; capped at 50 generations, oldest first; tolerates `null`/malformed history |
| Immutability | same file, `assertPackageRegenerationAllowed()` | once a `FilingRecord` exists the package may not be regenerated — the message points to an amendment (new return version) |
| Integrity | `verifyPackageEvidence()` | case-insensitive SHA-256 comparison, used when reading a package back |
| Service | `filing.service.ts` | loads the filing record and the existing package before the upsert, throws 400 on a filed return, writes `historyJson` |
| Schema | `FilingPackage.historyJson Json @default("[]")` | append-only chain; the entry **without** `supersededAt` is the package in force |
| Migration | `20261109110000_add_filing_package_history` | `ADD COLUMN "historyJson" JSONB NOT NULL DEFAULT '[]'` |
| Tests | `apps/api/test/filing-package-evidence.spec.ts` | 7 tests: first entry, supersede-not-replace, exactly one current after 5 generations, 50-entry cap, filed-return refusal, hash integrity, null/malformed history |

**Why an append-only chain rather than a version table:** the package is derived data keyed by
`returnVersionId`, and the existing chain (approval → filing → assessment) already models
versions. A second table would duplicate that; the JSON index keeps the proof next to the
package and is written in the same transaction as the upsert.

**Verified on the database:** migration applied to the fresh 55433 cluster — 6 migrations in
`_prisma_migrations`, `filing_packages."historyJson"` present, `migrate diff` → `-- This is an
empty migration.` (no drift).

## Phase 14 — API-6 was already delivered; the two pending migrations were not""")

rep("""| 2026-11-09 | Phase 14 — migrations 4 & 5 applied on a fresh cluster | ✅ 5 / 5 applied · 26 tables · `migrate diff` empty · API-6 found already delivered |""",
"""| 2026-11-09 | Phase 14 — migrations 4 & 5 applied on a fresh cluster | ✅ 5 / 5 applied · 26 tables · `migrate diff` empty · API-6 found already delivered |
| 2026-11-09 | Phase 15 — API-7 evidence index | ✅ **213 / 213 pass, 0 fail** (7 new tests) · migration 6 applied · `migrate diff` empty |""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
