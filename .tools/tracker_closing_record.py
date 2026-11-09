import io

p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

anchor = "## Phase 33 — the 8775 activation becomes a checked procedure"
assert s.count(anchor) == 1

closing = """## Closing record — 2026-11-09

**Decision: this goal is closed as `EXTERNALLY_BLOCKED`.** Recorded here rather than only in the
status line, so the basis is auditable later.

**Delivered and evidenced.** Phases 0–33. Tax engine (Art. 118 scale, 121 splitting, 124/126 floors,
120bis class 1a, CIS/CIP/CII/CI-CO2/CIM/CISSM/CO2 credits, deductions, rental register, plus-values,
Art. 7(2) and Art. 114 losses, Art. 115 n°13d), filing package with annex PDFs and evidence index,
calculation snapshots, audit hash chain, eight Prisma migrations applied to PostgreSQL 18.4 with
`migrate diff` empty, rate limiting, TOTP MFA, and all eleven MOB items — 395 tests, two `tsc`
configurations at exit 0, 55 files syntax `ok`.

**Not delivered, and why.**

| Item | Blocking fact |
|---|---|
| **R6** — 2026 CIC monthly bands | The table exists only in projet de loi 8775. `impotsdirects.public.lu/fr/legislation/legi26.html` ends at the *loi du 16 juillet 2026* (Mémorial A N° 360); `chd.lu/fr/dossier/8775` shows only *22.06.2026 — Déposé*. |
| **R7** — épargne-logement age limit | Same law. The 40-year condition is still in force, so `savingsHousingYoungMaxAge` stays `40`. |

**Why the two were not closed anyway.** Writing a `cic` table from memory, or flipping
`pendingMeasures` to `IN_FORCE` ahead of the law, would produce a package that passes every test in
this repository while mis-stating real residents' tax. A green suite cannot detect an invented
statute, which is exactly why the gate from Phase 30 exists: `checkPendingConsistency()` rejects a
measure declared in force without its data, and `cicForMonthlySalary()` returns `NOT_IN_FORCE`
rather than a silent zero.

**Verified state at closure** (`python .tools/activate_8775.py --check`):
`ok: rules/2026.ts is still gated (cic absent, age 40, both measures NOT_IN_FORCE)`.

**What reopens this goal.** The daily watch `861a3eef-273d-470c-a1de-475e4448138b` (cron `0 8 * * *`,
Europe/Luxembourg, enabled at revision 2) reports a new entry in the ACD list of laws. The reopening
sequence is Phase 33's runbook, four commands, no hand editing:

```powershell
python .tools/activate_8775.py --bands <published.json>
node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test <spec files>
python .tools/activate_8775.py --check   # expected to FAIL once the gate is live
```

The activation path itself was proven end-to-end in Phase 33 on a throwaway copy with synthetic
bands: the generated TypeScript compiled, the gate accepted it, and the lookup returned the hand-checked
values 84 / 94 / 109 / 68.

## Phase 33 — the 8775 activation becomes a checked procedure"""

s = s.replace(anchor, closing, 1)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
