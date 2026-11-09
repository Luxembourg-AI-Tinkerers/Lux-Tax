import io

p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

anchor = "## Phase 32 — the JSX layer enters type checking (and a shim that survives installs)"
assert s.count(anchor) == 1

phase = """## Phase 33 — the 8775 activation becomes a checked procedure

**Problem.** When the watch reports the Mémorial text, three edits must land together in a
hand-written TypeScript file that is CRLF-sensitive and must stay UTF-8 without BOM:

1. paste the published monthly table as `cic: { bands: [...], topAmount, topUpTo }`
2. add a `specialExpenses` override carrying `savingsHousingYoungMaxAge: 200`
3. flip **both** `pendingMeasures` to `IN_FORCE`

Missing any one of them leaves the package in a state Phase 30's gate now *rejects* — which is the
right failure, but it means publication day would have been spent debugging an editor rather than
applying a law.

**What was added.** `.tools/activate_8775.py`, which performs exactly those three edits from a JSON
file of published bands and nothing else:

| Guard | Behaviour |
|---|---|
| `--check` | asserts the file is still in the pre-publication state (`cic` absent, age 40, both measures `NOT_IN_FORCE`); run today it prints `ok` |
| non-empty bands | refuses an empty list or a band missing `from`/`to`/`slope`/`offset` |
| band sanity | refuses `from > to` and refuses overlapping bands — the two mistakes most likely when retyping 12 rows out of a PDF |
| idempotence | refuses to run on a file that already has `cic` or the 200 age limit, so a second invocation cannot double-apply |
| exact anchoring | requires the `ccssPensionRate: 0.17,` anchor to occur exactly once, and each measure to appear exactly once as `NOT_IN_FORCE` |
| encoding | reads/writes with `utf-8`, preserves the file's existing line endings |

**Verified end-to-end, not just written.** A throwaway copy `rules/2026.probe.ts` was generated from
* synthetic* bands (three bands, `topAmount: 68`, `topUpTo: 6000`), activated, and then:

- `tsc -p tsconfig.test.json` compiled it — **exit 0**, so the generated TypeScript is valid;
- an import probe asserted `checkPendingConsistency(probe) === []` (the gate accepts the activation),
  `savingsHousingYoungMaxAge === 200`, and the lookup returned **84 / 94 / 109 / 68** for 2 000 /
  3 000 / 4 000 / 5 000 € — each value matching the synthetic table by hand;
- the same probe asserted the **shipped** package is untouched: `cic === undefined`, age `40`,
  `cicForMonthlySalary(SHIPPED, 3 000).status === 'NOT_IN_FORCE'`.

Both probe artifacts were then deleted; nothing synthetic remains in the repository.

**Publication-day runbook** (four commands, no editing by hand):

```powershell
python .tools/activate_8775.py --bands <published.json>
node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test <spec files>
python .tools/activate_8775.py --check   # now expected to FAIL: the gate is live
```

**Verification:** **395 / 395 tests**, `tsc -p tsconfig.test.json` exit 0,
`tsc -p tsconfig.render.json` exit 0, **55 files** syntax `ok` — unchanged, because the script and its
probe live outside the shipped packages.

## Phase 32 — the JSX layer enters type checking (and a shim that survives installs)"""

s = s.replace(anchor, phase, 1)
s = s.replace(
    "> - **Implemented and tested:** Phases 0–32 — tax engine, filing package + annex PDFs, eight",
    "> - **Implemented and tested:** Phases 0–33 — tax engine, filing package + annex PDFs, eight",
    1,
)
s = s.replace(
    "**Last updated:** 2026-11-09 · Phases 0–32 implemented",
    "**Last updated:** 2026-11-09 · Phases 0–33 implemented",
    1,
)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
