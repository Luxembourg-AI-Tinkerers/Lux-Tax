# Handoff — activating projet de loi 8775 (2026 CIC + épargne-logement)

**Status: PARKED, not pending.** R6 and R7 sit in the backlog; nothing in the active queue depends on
them. Do not re-open them on a hunch — only a published text unparks them.

**Read this if** the daily watch `861a3eef-273d-470c-a1de-475e4448138b` has reported a **new entry**
in the ACD list of laws for 2026, or if you are otherwise told the Mémorial published loi 8775.

**Do not read this as permission to guess.** If the published text is not in hand, stop: two rows of
`implementation-tracker.md` (R6, R7) stay open, and that is the correct state.

---

## 1. What the law changes

| Tracker row | Change | Where it lands |
|---|---|---|
| **R6** | 2026 crédit d'impôt conjoncture: a **monthly** table by salary band, paid June–October 2026, bonified by 31.12.2026 | new `cic` field in `packages/tax-engine/src/rules/2026.ts` |
| **R7** | épargne-logement: the **40-year age limit** for the increased cap is removed | `specialExpenses.savingsHousingYoungMaxAge`: `40` → `200` |

Both are gated in `pendingMeasures` as `NOT_IN_FORCE`. Do not flip them without the data.

## 2. Supply the table as JSON

Take the amounts **from the published text**, not from memory, a press article, or another year's
table. Shape expected by the script:

```json
{
  "bands": [
    { "from": 0,     "to": 2500,    "slope": 0,    "offset": 84 },
    { "from": 2500.01, "to": 3500,  "slope": 0.02, "offset": 34 }
  ],
  "topAmount": 68,
  "topUpTo": 6000
}
```

`slope`/`offset` describe `monthly = salary × slope + offset` inside a band. If the published table is
a flat amount per band, use `slope: 0` and put the amount in `offset`. `topAmount` applies above the
highest `to`, up to `topUpTo`.

## 3. Run the four commands

```powershell
python .tools/activate_8775.py --bands <published.json>
node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json
node .tools/node_modules/typescript/bin/tsc -p tsconfig.render.json
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test <spec files>
```

The script edits `rules/2026.ts` only: inserts `cic`, adds the `specialExpenses` override with
`savingsHousingYoungMaxAge: 200`, flips both measures to `IN_FORCE`. It refuses to run twice, refuses
an empty/overlapping band list, and preserves the file's CRLF line endings and BOM-free UTF-8.

## 4. Acceptance criteria — all four must hold

1. `tsc -p tsconfig.test.json` → exit **0** (the generated TypeScript compiles).
2. `python .tools/activate_8775.py --check` → **fails**, because the gate is now live. A pass here
   means the edit did not land.
3. The test suite passes, **including** `packages/tax-engine/test/pending.spec.ts`: its
   "every shipped package is internally consistent" case now covers the activated package, and will
   fail if `cic` and the measure status disagree in either direction.
4. Spot-check two or three bands by hand against the published table. The synthetic dry-run in
   Phase 33 produced 84 / 94 / 109 / 68 € for 2 000 / 3 000 / 4 000 / 5 000 € — recompute the same
   way for the real numbers.

## 5. Then record it

Add a phase to `implementation-tracker.md` (next free number) stating: the Mémorial reference of the
law, the band count, the spot-checked values, the four command results, and the removal of
`CIC_2026` / `EPARGNE_LOGEMENT_8775` from the open-rows table. Update the status box: `GOAL STATUS`
becomes `COMPLETE`, and the "blocked on an external document" bullet goes away.

## 6. Why this file exists

`implementation-tracker.md` is ~150 KB; a future session may not read it all. This card is the short
version, and the only part of the handoff that matters on publication day: **the law is the source,
the script is the mechanism, the gate is the check.**
