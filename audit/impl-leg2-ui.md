# Implementation report — LEG-2 web UI (Art. 122 dégrèvement, Art. 123bis bonification)

Date: 2026-11-08. Scope: web UI only for the LEG-2 engine/contracts delivered in `audit/impl-leg2.md`.
Inputs read first: `audit/impl-leg2.md`, `packages/contracts/src/tax.ts` (`ChildReliefBreakdownDto`, `TaxCalculationResultDto.childRelief`), `packages/contracts/src/questionnaire.ts` (`childBenefitReceived?`, `childrenWithBonification?`), then both components and `.tools/syntax_check.cjs` / `tsconfig.test.json`.

No engine, API, contract, validation, or docs change.

## 1. Files changed

| File | Change |
|---|---|
| `apps/web/src/components/QuestionnaireView.tsx` | Initial questionnaire state gains `childBenefitReceived: true`. In the "Household & professional profile" grid, directly after the `childrenWithModeration` field, two new cells: a checkbox bound to `childBenefitReceived` and a number input bound to `childrenWithBonification`. |
| `apps/web/src/components/TaxCalculatorView.tsx` | New "Child relief" group inside the existing "Deduction and credit breakdown" card, after the breakdown grid and before the warnings list. Guarded by `calc.childRelief && calc.childRelief.total > 0`. |
| `.tools/syntax_check.cjs` | **Unchanged** — `apps/web/src/components/TaxCalculatorView.tsx` and `apps/web/src/components/QuestionnaireView.tsx` were already listed (entries 4 and 5). No new web file was created, so nothing to add. |

### QuestionnaireView.tsx details

- State: `childBenefitReceived: true` added to the `useState<QuestionnaireAnswersDto>` initialiser, next to `childrenCount: 0` (same pattern as the existing `hasEmploymentIncome: true` seed). `childrenWithBonification` is left out of the seed and rendered with `?? ''` + placeholder `0`, matching the existing optional-number fields (`childrenWithModeration`, `primaryAge`, …).
- Checkbox is `checked={answers.childBenefitReceived ?? true}` so an answer payload stored before this change (key absent) still renders checked, i.e. the engine's documented default-true semantics. Unchecking stores `false`.
- Payload: unchanged. `handleSave` sends the whole `answers` object (`apiClient.saveQuestionnaire(workspaceId, answers)`), so both fields ride along with no payload code edit.
- No existing field removed or reordered; the two new cells sit between `childrenWithModeration` and `Reduced working capacity`.

### TaxCalculatorView.tsx details

- Rows use the same styling as the credit rows: `flex justify-between border-b border-slate-100 py-1`, label `text-slate-600`, amount `font-semibold`, all amounts `toFixed(2)` with the existing `-€` prefix convention (these are reductions of the liability).
- Total row reuses the bold row style (`flex justify-between py-1 font-bold text-slate-900`).
- Display-only: nothing is subtracted in the component; `childRelief` is already inside `finalTaxLiability` on the engine side, so the group is explanatory. `totalTaxCredits` and the hero balance band are untouched.
- The `&&` guard also covers pre-LEG-2 stored `workspace.calculationResult` snapshots that have no `childRelief` key (flagged in `audit/impl-leg2.md` §6): the group is simply hidden instead of throwing on `.total`.

## 2. Exact labels and state keys

| Control | Label (verbatim) | Helper text (verbatim) | Bound field | Bounds / default |
|---|---|---|---|---|
| Checkbox | `Family allowance / CEDIES / SNJ received for these children?` | `If none was received, a EUR 922.50 per-child dégrèvement (Art. 122) applies on request.` | `answers.childBenefitReceived` | default checked (`?? true`) |
| Number | `Children with expired moderation (bonification, Art. 123bis)` | `Child left the household / studies finished; at most two bonifications per child.` | `answers.childrenWithBonification` | `min={0}` `max={20}`, placeholder `0`, empty = `undefined` |
| Group heading | `Child relief` | — | `calc.childRelief` | rendered only when `.total > 0` |
| Row | `Dégrèvement (Art. 122)` | — | `calc.childRelief.degrevement` | `-€…toFixed(2)` |
| Row | `Bonification (Art. 123bis)` | — | `calc.childRelief.bonification` | `-€…toFixed(2)` |
| Total row | `Total child relief` | — | `calc.childRelief.total` | `-€…toFixed(2)`, bold |
| Note | `Bonification phased out at your RIA` | — | `calc.childRelief.bonificationPhaseOut === true` | `text-[11px] text-amber-700` |

## 3. Checks run

| Check | Command | Result |
|---|---|---|
| Syntax/transpile (incl. both edited files) | `node .tools/syntax_check.cjs` | **27/27 ok, exit 0**; `ok apps/web/src/components/TaxCalculatorView.tsx`, `ok apps/web/src/components/QuestionnaireView.tsx` |
| Type check (required project) | `node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json` | **exit 0** |
| Contract-level type probe (extra) | temp `.tmp-leg2-ui-check.ts` + `.tools/tsconfig.leg2-ui.check.json` (extends `tsconfig.test.json`), `tsc -p .tools/tsconfig.leg2-ui.check.json` | **exit 0** — the exact `calc.childRelief && calc.childRelief.total > 0` guard, the three `toFixed(2)` accesses, the `bonificationPhaseOut` ternary, and a `QuestionnaireAnswersDto` literal with `childBenefitReceived: true` + `childrenWithBonification` read. Temp files deleted afterwards (verified count 0). |

Both required commands were re-run on the final tree after the probe files were removed.

## 4. Remaining limits (not verified)

1. **No render/browser verification.** The workspace has no React/Next dependencies (`apps/web/node_modules` absent, `.tools/node_modules/@types/react` absent), so the components were never mounted. Layout of the two new questionnaire cells inside the `sm:grid-cols-2` grid and of the relief group under the breakdown card is reasoned from the existing markup, not observed.
2. **`tsconfig.test.json` does not include `apps/web`.** The edited TSX is verified at transpile level (syntax + JSX well-formedness) plus the contract-level probe above — not by a full JSX/prop type check. A `tsc -p apps/web/tsconfig.json` needs the web dependencies and was not run.
3. **"Before the final liability" is positional only.** `TaxCalculatorView.tsx` renders no final-liability row at all (the hero banner shows the balance payable/refund), so the group sits at the end of the breakdown card, after the taxable-income and rate rows. If a `finalTaxLiability` row is added later, this group should move directly above it.
4. **Persistence path not exercised.** That `childBenefitReceived` / `childrenWithBonification` survive questionnaire PUT → `calculations.service.ts` mapping → engine needs the API and Postgres; only the client-side state/payload shape is verified (whole-object submit, contract fields optional and present in state).
5. **"At most two bonifications per child"** is helper text only; a single count input cannot enforce it. The input caps the total at 20 as briefed.
6. **Note semantics.** `bonificationPhaseOut` is, per `audit/impl-leg2.md` §4.2, `bonificationComputed > bonification` — true when remaining tax cut the bonification, not when the €67,400–76,600 RIA band reduced it. The note text is the briefed wording, so in the phase-out band the note does not appear while the amount is already reduced. Flagged, not changed.
7. **Old snapshots**: with the guard, a stored result without `childRelief` hides the group; no backfill was added (out of scope).
