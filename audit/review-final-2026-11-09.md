# Final review — 2026-11-09

## 1. Conclusion

**Verdict: not deliverable as-is.** Six must-fix findings, five worth-considering findings and six observations. The Art. 122/123bis resolver itself implements the rules in `research/2025-2026-lu-tax-credits-and-classes.md` §2.3 (two-year window, two-bonification lifetime cap, no dégrèvement + bonification for the same child, the 2025–26 résidence-alternée conditions); the single-slice foreign-credit test still passes; `param-wiring.spec.ts` passes; and the notification schema/migration/module graph is internally consistent. The failures are integration and legacy-data failures, not missing features.

| Area | Verdict | Evidence |
|---|---|---|
| Art. 122/123bis resolver | **pass** (rules) / **fail** (engine integration) | `packages/tax-engine/src/child-relief.ts:26-103`; `child-relief.spec.ts` passes (14 tests); integration finding MF-2 |
| Foreign tax credit | **partial** | single-slice test passes; per-country cap is wrong for multiple countries (MF-3) |
| Param wiring | **pass** (name-level) | `apps/api/test/param-wiring.spec.ts` 6/6; `tsc -p tsconfig.test.json` exit 0; semantics not covered (MF-2) |
| Member selection | **partial** | `filing.service.ts:377` and `freelance.service.ts:275` are actor-aware; `annex-pdf.service.ts:52` is not (MF-5); three-filer ambiguity (W1) |
| Form 100F | **partial** | DS 1553 and Art. 91 routing are present (`filing.service.ts:730-738,788-801`; `form100-case-map.ts:90-95`); the unmapped-code warning is not persisted (MF-6); legacy DS 1553 fallback is empty (MF-1) |
| Display wording | **partial** | CIM card and class-2 label work on a new result; legacy result crashes the view (MF-1); refund banner only partly distinguishes CIM (W4) |
| Notifications | **pass** (static) | `schema.prisma:674-701`; `migrations/20261109140000_add_notification_dedupe/migration.sql`; `notifications.service.ts:242-248,305-315`; module imports have no cycle; no runtime DB run |
| Legacy UI compatibility | **fail** | `TaxCalculatorView.tsx:228` (MF-1); `FilingPackageView` handles the three fields named in the brief (`box.kind`, missing `unsupportedCertificateCodes`) |

## 2. Must fix

### MF-1. Existing calculation snapshots crash the calculator tab; a regenerated package can print DS 1553 = 0

**Position:** `apps/api/src/modules/calculations/calculations.service.ts:465-469`; `apps/web/src/components/TaxCalculatorView.tsx:228,336,349,456`; `apps/api/src/modules/filing/filing.service.ts:788-793`.

**Problem:** `getLatestCalculation` returns the stored `calculationResult` JSON without normalisation. The pre-change contract (`git show HEAD:packages/contracts/src/tax.ts`) had no `credits`, `deductions` or `assessmentMode`; the old engine returned `totalDeductions`, `totalTaxCredits`, `baseTax`, etc. The new view dereferences `calc.credits.cimRefund` at line 228. I mounted the real component with a representative pre-change object and reproduced:

```
TypeError: Cannot read properties of undefined (reading 'cimRefund')
    at TaxCalculatorView (apps/web/src/components/TaxCalculatorView.tsx:228)
```

Even if that line were guarded, `calc.assessmentMode.replace(...)` (line 336), `calc.deductions.fraisObtention` (line 349) and `calc.effectiveTaxRate.toFixed` (line 456) are also absent on old results. On the server, the DS 1553 fallback at `filing.service.ts:788-793` reads `calcDeductions.art111/asrd/art111bis/savingsHousing`; an old snapshot has no `deductions` object at all, so the fallback computes 0.00 instead of rebuilding anything.

**Impact:** every workspace with a stored pre-change result cannot open the calculator tab until it runs a new calculation; a package regenerated from that stored result understates DS 1553 and can be filed with a wrong special-expenses line.

**Basis:** old DTO/engine shape from `git show HEAD`; reproduced runtime error above.

**Fix direction:** version the stored result and migrate/normalise on read, or return a "recalculate" error for stale shapes; add a test using the actual pre-change shape. The current `apps/web/test/tax-calculator-view.spec.ts:142-150` only drops `unsupported`, so it cannot catch this.

### MF-2. Per-child history is authoritative only for the relief amount, not for CIM, class or deduction caps

**Position:** `packages/tax-engine/src/engine.ts:839,859,1049,1241`; `apps/api/src/modules/calculations/calculations.service.ts:148-150,161,210,216`; `apps/api/src/modules/calculations/class-resolution.ts:83-122`; `packages/contracts/src/tax.ts:20-21`; `apps/web/src/components/QuestionnaireView.tsx:738`.

**Problem:** `resolveChildReliefHistory` returns a correct `moderationCount`, but the engine still uses the raw `childrenWithModeration` parameter for the deduction context (mortgage/ASRD), the Class 1a warning and the CIM gate. The service derives that scalar from `answers.childrenWithModeration` or `childrenCount`/household dependants, not from `childReliefHistory`. The contract and the UI say the history is authoritative ("overrides the three counts above").

Two probes against the real engine:

* Class 1A, salary 40,000, one child with `moderationEndYear: 2024` (no moderated child this year), `childrenWithModeration: 1` from the dependant fallback: CIM = 3,504, `cimApplied` = 749.96, `cimRefund` = 2,754.04. The research requires "at least one child in the household that triggers a modération d'impôt pour enfant" (`research/2025-2026-lu-tax-credits-and-classes.md:90`).
* Three dependants, history has two moderated children plus one expired, mortgage interest 30,000: `childrenWithModeration: 3` gives a 16,000 deduction; the correct history count of 2 gives 12,000.

Class resolution has the same split: `deriveTaxClass` (`class-resolution.ts:83-122`) receives the scalar, so a history-only moderated child can fail to produce Class 1a.

**Impact:** over- or under-stated refundable CIM and deduction caps, and a wrong tax class, for exactly the users of the new per-child editor.

**Basis:** `child-relief.ts`/contract "authoritative" comment; research §2.2; probes above.

**Fix direction:** derive the moderation count from `childReliefHistory` in `CalculationsService` and/or use `moderationCount` inside the engine for CIM, deduction context and class resolution; add history-only tests for CIM and the mortgage cap.

### MF-3. Per-country foreign-credit caps are summed marginal differences, so the total exceeds the tax attributable to the foreign income

**Position:** `packages/tax-engine/src/engine.ts:1163-1174`.

**Problem:** each slice cap is `ordinaryCote - tax(base - slice.income)`, computed against the full base. The sum gives every country the top-band tax and counts the overlapping band more than once. Probe: salary 60,000, DE 50,000 with 50,000 foreign tax, BE 50,000 with 50,000 foreign tax. The engine returns cote 50,170 and a credit of 39,830. The tax on the combined 100,000 foreign income is 39,415 at the aggregate marginal calculation and 31,557.43 at the Luxembourg fraction; the research defines the ordinary credit as "the Luxembourg tax fraction corresponding to the foreign income ... computed per State of source" (`luxembourg-resident-tax-research.md:193`).

The existing `foreign-credit.spec.ts` asserts the same marginal formula and only checks that the credit is at most the cote, so it cannot catch the cross-slice inflation. The existing single-slice dividend test passes, and the cote bound does hold.

**Impact:** about EUR 8,273 over-credit in the probe (about EUR 415 above even the aggregate marginal cap), i.e. understated Luxembourg tax for a multi-country filer. This is the opposite of the stated "a high-tax country cannot borrow another country's unused cap" goal.

**Basis:** research line 193; probe output above.

**Fix direction:** compute each country's cap from the same fraction (`cote × country income / total taxable`, with the exemption-scaling handled once) or allocate the base sequentially; test two high-foreign-tax countries against both the fraction and the aggregate cap.

### MF-4. Non-resident itemised foreign income is added to the base although the engine says it is excluded

**Position:** `packages/tax-engine/src/engine.ts:199-203,426-436,723`.

**Problem:** the non-resident-without-assimilation branch sets `excludeForeignIncome = true` and pushes the warning "Foreign income is excluded from the base". `hasForeignItems` then adds every credit-method `creditForeignIncome` to `netIncome` unconditionally. Probe: NON_RESIDENT, salary 60,000, DE item 20,000 with 2,000 foreign tax, no assimilation. Without the item the taxable income is 58,980 and the tax 11,111.85; with the item the taxable income is 78,980 and the tax 17,457.85, while the warning still says the foreign income is excluded.

**Impact:** a non-resident is taxed on foreign-source income and receives a foreign credit; the liability is wrong for that path.

**Basis:** the two probes above; the warning string at `engine.ts:201-203`.

**Fix direction:** gate `creditForeignIncome` (and the credit) on `excludeForeignIncome === false`, or reject itemised foreign income for a non-assimilated non-resident with an `unsupported` message; cover both cases in a test.

### MF-5. Annex PDF is not actor-aware while the filing package is

**Position:** `apps/api/src/modules/filing/annex-pdf.service.ts:52`; `apps/api/src/modules/filing/filing.controller.ts:149-154`; `apps/api/src/modules/filing/filing.service.ts:377`.

**Problem:** the package selects members with `selectFilerMembers(members, userId)` and deliberately uses the acting filer as the taxpayer column. The annex builder calls `selectFilerMembers(members)` with no actor and derives `taxpayer` from the `PRIMARY_FILER`. In the widow/divorced scenario the change is meant to fix, a CO_FILER generates the package (their name and column in Form 100F), then the annex PDF names the stale PRIMARY_FILER (the deceased or former spouse).

**Impact:** inconsistent taxpayer identity across the same filing package; a filing annex can name the wrong person.

**Basis:** `filing.service.ts:377` vs `annex-pdf.service.ts:52`; the controller does not pass `@CurrentUser('id')` to `buildForWorkspace`.

**Fix direction:** pass the actor id to `buildForWorkspace` and use the same selection, or persist the package's designated taxpayer/primary id and use that in both files.

### MF-6. `unsupportedCertificateCodes` is not persisted or returned by the package GET, so the warning disappears

**Position:** `apps/api/src/modules/filing/filing.service.ts:369,457,466,1014,1109`; getter `:1519-1529`; `apps/web/src/components/FilingPackageView.tsx:104,407`.

**Problem:** generation returns the array, but `getLatestFilingPackage` omits it and no column stores it. `handleGeneratePackage` immediately calls `loadFilingData`, which overwrites the package with the GET DTO. After the first GET or any reload, `(unsupportedCertificateCodes ?? [])` is always empty; an unmapped `ZZ`/`FDD` is silently absent again.

**Impact:** the user cannot see which certificate 160 codes were dropped, and the package evidence does not preserve the warning. This contradicts the change's claim that the view renders the list.

**Basis:** the getter return object at `filing.service.ts:1519-1529` has no `unsupportedCertificateCodes`; the UI reload at `FilingPackageView.tsx:104`.

**Fix direction:** persist the list (a column or package JSON) and return it in `getLatestFilingPackage`; add an API test for a generated package containing an unknown code.

## 3. Worth considering

### W1. `selectFilerMembers` still mis-pairs a household with a PRIMARY_FILER plus two CO_FILERs

**Position:** `apps/api/src/modules/calculations/class-resolution.ts:190-199`; `packages/tax-engine/src/engine.ts:233-235` is where the merge happens; `apps/api/test/class-resolution.spec.ts:147-151` treats two CO_FILERs as valid.

**Problem:** when the actor is one of two CO_FILERs, the first non-primary CO_FILER is selected as spouse instead of the remaining PRIMARY_FILER. The actual primary's facts then fall into the `primary` bucket because `ownerBucket` special-cases only `spouseUserId`; the third filer's income is merged with the actor's.

**Impact:** wrong couple/income split if a third filer is invited; the app allows multiple CO_FILER invitations (`packages/validation/src/household.schema.ts:15-21`).

**Suggestion:** enforce at most one CO_FILER, or select the PRIMARY_FILER as the spouse in the promoted-CO_FILER fallback and reject additional filers from the pairing.

### W2. CIM is applied before the non-refundable child relief

**Position:** `packages/tax-engine/src/engine.ts:1367-1403`; the existing test `packages/tax-engine/test/tax-engine.spec.ts:1174-1190` codifies the order.

**Problem:** `cimApplied` reduces the tax first; the Art. 122/123bis relief is then computed on what remains. Probe: tax 749.96, CIM 3,504, bonification-eligible child -> `cimApplied` 749.96, `cimRefund` 2,754.04, `childRelief.total` 0. Applying the non-refundable relief first would reduce the tax and increase the refundable CIM by the same amount, a EUR 922.50 difference per child. The research states the CIM is refundable and the dégrèvement is not, but does not settle the imputation order.

**Suggestion:** confirm the legal order with the ACD text before keeping this; if the non-refundable relief should be imputed before the refundable credit, reverse the two steps and update the test.

### W3. A history row defaults to "no allowance paid", granting the dégrèvement

**Position:** `packages/tax-engine/src/child-relief.ts:43`; `apps/web/src/components/QuestionnaireView.tsx:789-790`; scalar default `packages/tax-engine/src/engine.ts:103`.

**Problem:** the UI checkbox is unchecked by default, so `benefitReceived` is `undefined`; the resolver treats `!== true` as no benefit and counts a EUR 922.50 dégrèvement. The scalar path defaults `childBenefitReceived = true`, the conservative opposite. A user who adds a moderated-child row and does not tick "Allowance / CEDIES / SNJ paid" gets an unwarranted reduction.

**Suggestion:** default the history checkbox to true (or require an explicit answer) and keep the two paths consistent.

### W4. The refund banner names withholding when both withholding and CIM fund the refund

**Position:** `apps/web/src/components/TaxCalculatorView.tsx:170-172`.

**Problem:** when `taxWithheldAtSource > 0`, the banner says only "Excess tax deducted at source will be reimbursed", even if a CIM refund is also part of the negative balance. The CIM-specific text is used only when withholding is zero.

**Suggestion:** show both components ("withholding + refundable CIM") when both are non-zero.

### W5. `createForUser` can throw on a concurrent duplicate despite the unique index

**Position:** `apps/api/src/modules/notifications/notifications.service.ts:129-151`.

**Problem:** it does a `findFirst` followed by `create`; two concurrent emissions with the same `(userId, dedupeKey)` can both miss the lookup and the second `create` throws the unique-constraint error instead of returning the existing row. The `createMany({ skipDuplicates: true })` fan-out path is safe; only `createForUser` is exposed.

**Suggestion:** catch the unique error and re-read, or use an upsert/`createMany` with `skipDuplicates`; add a concurrency test.

## 4. Only record

* `packages/tax-engine/src/child-relief.ts:69-71` returns silently for a moderation end year older than the two-year window, while the function docstring says entries are "never silently ... dropped"; the behaviour is intentional but the comment overstates it.
* `packages/tax-engine/src/engine.ts:1502-1506` reports `bonificationPhaseOut = true` at exactly RIA 76,600 even though the computed bonification is 0; display flag only.
* `apps/web/src/components/FilingPackageView.tsx:269` dereferences `VERSION_STATUS_STYLES[item.status]`; an unknown status would crash. All current statuses are covered, so this is a forward-compatibility note.
* `apps/api/src/modules/notifications/notifications.service.ts:223` returns `deliverable.length`, not the number of rows actually inserted; no caller uses the value today.
* No `SECURITY_ALERT` producer exists; the service/zod mute guard is dormant, not harmful.
* `resolveChildReliefHistory` would treat a NaN `moderationEndYear` as inside the window; Zod rejects NaN and JSON cannot carry it, so this is a direct-call-only note.

## 5. Review scope and not covered

**Reviewed:** the changed engine (`packages/tax-engine/src/engine.ts`, `child-relief.ts`, `credits.ts`, `deductions.ts`, `forms/certificate160.ts`), contracts and validation, `calculations.service.ts`/`class-resolution.ts`, `filing.service.ts`/`annex-pdf.service.ts`/`form100-case-map.ts`, `freelance.service.ts`, `notifications.service.ts`/`notification-rules.ts`/controller/module, Prisma schema and the notification/dedupe migrations, and the changed web views (`TaxCalculatorView`, `FilingPackageView`, `QuestionnaireView`, `NotificationCenter`, `AssessmentView`, `FactsView`).

**Standards used:** the task's six acceptance areas; `research/2025-2026-lu-tax-credits-and-classes.md` §2.2/§2.3 (CIM, two-year window, two-bonification cap, same-year exclusion, résidence alternée); `luxembourg-resident-tax-research.md:193` (Art. 134bis fraction, per State of source); the existing tests' stated expectations; and the implementation tracker's claims.

**Runs:**
* `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/child-relief.spec.ts packages/tax-engine/test/foreign-credit.spec.ts packages/tax-engine/test/tax-engine.spec.ts apps/api/test/param-wiring.spec.ts` -> 121 pass, 0 fail.
* The same runner over `child-relief`, `foreign-credit`, `certificate-codes`, `param-wiring`, `class-resolution`, `annex-pdf`, `form100-case-map`, `filing-package-evidence`, `notification-rules` -> 96 pass, 0 fail.
* The web view tests (`tax-calculator-view`, `questionnaire-view`, `fact-inclusion`) -> 18 pass, 0 fail.
* `node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json` -> exit 0.
* `node .tools/syntax_check.cjs` -> 72 files, 0 fail markers.

**Not covered / could not verify:**
* API e2e, Prisma queries and the notification SQL were not executed: `@nestjs/common`, `@prisma/client` and `fastify` are not installed in this workspace. `tsc -p tsconfig.api.json` fails at those module-resolution errors (not a finding); the notification schema/migration/index and OR scope were checked statically only.
* The migration was not applied to a database; the index name/columns in `20261109140000_add_notification_dedupe/migration.sql` match `schema.prisma:698`.
* No browser render: `TaxCalculatorView` was exercised with `react-test-renderer`; the legacy crash was reproduced there.
* The official 100F page/sheet/case numbers were not re-extracted from `100f-2025.pdf`; the map constants were treated as data and checked for internal consistency. The 160 code table was checked against the local notes, not the ACD list.
* Mobile device behaviour was not run (outside this review's scope and no device available).

## 6. Resolution after this review

All six must-fix findings were fixed in the same session, and the four worth-considering items
W1/W3/W4/W5 were fixed too. Re-verification after the fixes: **537 / 537 tests** across 43 spec files,
`tsc -p tsconfig.test.json` exit 0, `tsc -p tsconfig.render.json` exit 0, `node .tools/syntax_check.cjs`
72 files / 0 failures. The tracker section “2026-11-09 — ninth pass” records each fix.

| Finding | Resolution |
|---|---|
| MF-1 | `TaxCalculatorView` detects a result without `credits`/`deductions`/`assessmentMode` and offers a recalculation instead of dereferencing it; the package emits a DS 1553 INSTRUCTION when the snapshot has no breakdown. |
| MF-2 | The engine uses `moderationCount` for the CIM gate, the mortgage/ASRD multiplier and the Class 1a check; `CalculationsService` derives the count from `childReliefHistory` before class resolution. New engine tests cover CIM-on and CIM-off. |
| MF-3 | Each country is capped at the Art. 134bis fraction `cote × country income / taxable`; the LEG-4 test was corrected to the fraction. |
| MF-4 | A non-assimilated non-resident’s itemised foreign income is ignored with an explicit warning; a test asserts the base and cote are unchanged. |
| MF-5 | `buildForWorkspace(workspaceId, actorId)` and the controller pass the acting user; annex and package now select the same taxpayer. |
| MF-6 | `unsupportedCodesJson` (migration `20261109150000`) persists the list and `getLatestFilingPackage` returns it. |

**Open by decision, not by defect:** W2 (imputation order between the refundable CIM and the
non-refundable Art. 122/123bis relief) is left as recorded — the research does not settle it and the
ACD text must be checked before changing a figure worth EUR 922.50 per child. Foreign income is still
not split by nature (S/P/CM/L) because the app has no per-fact foreign nature; the package emits an
instruction naming the relevant sheets and RD 1081/1082 instead of guessing a case.

Migration `20261109140000_add_notification_dedupe` and `20261109150000_add_unsupported_codes` are
authored but **not applied**: this environment has no generated Prisma client and no running database.

### Addendum — delivery layer added after this review

The notification outbox was built after this review closed, so it is not covered by the six findings
above. It is verified by its own suites instead:

* `apps/api/test/notification-delivery.spec.ts` — backoff sequence (1 min, 5 min, 25 min, 1 h cap),
  retry budget, due/reminder-window predicates, channel selection (including security alerts
  ignoring preferences), and the e-mail/push adapters writing a JSONL sink.
* `apps/api/test/notification-outbox.spec.ts` — a real pass against an in-memory store: send,
  reschedule, dead-letter on the fifth failure, skip an unconfigured push channel, refuse a row
  already claimed by another worker, and keep going after one bad row.

Gates at the tip: **562 / 562 tests** across 46 spec files, both `tsc` configurations exit 0,
`node .tools/syntax_check.cjs` 0 failures.
