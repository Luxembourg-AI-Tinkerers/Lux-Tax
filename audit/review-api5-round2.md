# API-5 re-review — round 2 (F1 / F2)

Date: 2026-11-09
Scope: `audit/review-api5.md` §2 F1/F2, `audit/impl-api5.md` §6, and the current working tree of `B:\B\tax-app`.
Baseline: the two blocker statements in the brief, the prior review's F1/F2 acceptance criteria, and the eight-suite / `tsc` / syntax gate.

**allPass: true** — 0 must-fix, 16/16 checks pass. F1 and F2 are closed on the normal path: the demo write now invalidates standing approvals exactly once when it creates facts, and the filing view treats a successful `null` as authoritative and remounts on a workspace change. The three residuals in §3 are failure-path / parent-level observations, none of which blocks this fix round.

## 1. Conclusion

The two blockers are fixed as claimed. `FreelanceModule` imports `ReturnApprovalsModule`, `FreelanceService` injects `ReturnApprovalsService`, and `loadDemoData` calls `invalidateForChange(workspaceId, actorId, 'Freelance demo facts loaded')` once, after the last fact write, only when `count > 0`. No other application `confirmedFact` write is unguarded: the three in `facts.service.ts` still call the shared service, and the one in `freelance.service.ts` is the fixed site. `FilingPackageView` now writes `data ?? null` on a non-error response, keeps state only when the request itself errors, clears `returnVersion` / `filingPackage` / `history` / `historyLoaded` on `workspace.id` change, and the dashboard passes `key={workspace.id}`; the unreachable member-card superseded block is gone and the empty copy says "all required approvers".

The regression gate reproduces: 179/179 tests, `tsc` exit 0, syntax 43/43. The F1 runtime probe re-runs 13/13, and the F2 strict typecheck re-runs with the component in the program. The remaining findings are not blockers: a non-atomic failure window that is worse than the generic W2 because a demo re-run is a no-op (W1), a package that is not bound to the current version on a failed refresh (W2), and a parent-level year-switch fetch failure that can still leave the previous year mounted (W3).

## 2. Must fix

None.

## 3. Worth considering

### W1 — F1 shares the non-atomic write window, and a demo re-run cannot retry the invalidation

- **Position**: `apps/api/src/modules/freelance/freelance.service.ts:500-518` (audit row, then `if (count > 0) await invalidateForChange(...)`), `apps/api/src/modules/filing/return-approvals.service.ts:71-104` (three independent writes: `updateMany`, `taxYearWorkspace.update`, `auditService.logEvent`).
- **Problem**: the demo documents/facts are committed before the invalidation. If `invalidateForChange` throws after the facts exist, the request fails but the facts stay and the approvals stay active. Unlike `facts.service` edits, re-running the demo is not a retry: every demo document already exists, `findFirst` returns it, `count` stays 0, and the `if (count > 0)` guard skips the invalidation. The approval can then remain active until some other material change or manual repair.
- **Impact**: a transient Prisma/audit failure during the demo call leaves exactly the state F1 targets — an active approval over changed facts — and the visible "Load Freelance Demo Data" action cannot repair it (`FreelanceBusinessView.tsx:165-166` only shows the error toast). The normal success path is correct; this needs a failure between two writes, so it is not a blocker, but the recovery is weaker than for the other triggers.
- **Basis**: the three awaits have no transaction; `count++` is inside `if (!existingDoc)` (`freelance.service.ts:430-495`); the probe's second run confirms `count 0` and no invalidation; the prior review's W2 already recorded the same non-atomicity for the other call sites.
- **Direction**: make the demo fact writes + invalidation one transaction/outbox, or record a pending invalidation that a re-run can complete even when `count === 0`.

### W2 — A failed refresh can leave the previous version's package under the new approval

- **Position**: `apps/web/src/components/FilingPackageView.tsx:61-63` (keeps state on `error`), `:100-102` (sets the package from the generate response), `:378-382` (renders whatever `filingPackage` holds); `FilingPackageDto` carries `returnVersionId` and `taxYear` (`packages/contracts/src/filing.ts:106-109`).
- **Problem**: after a successful re-approval, `handleApprove` sets the new `returnVersion`, then calls `loadFilingData`. If `getFilingPackage` fails, line 62 keeps the previous version's package and the package block renders it next to the new approval with no error marker. The converse is also possible: a failed `getReturnVersion` keeps the old version while the package updates.
- **Impact**: the v1 SHA-256 and Form 100 boxes can be shown as the current package under a v2 approval until a later successful refresh; the user may copy or download stale values. This is the error-path tradeoff the fix was asked to keep ("keeps state only on request errors"), so it is not a blocker, but the view can cheaply bind the two.
- **Basis**: `getLatestReturnVersion` / `getLatestFilingPackage` query the active version and return 200 `null` when it has no row/package (`filing.service.ts:1127-1132, 1169-1174`); the DTO exposes the version id; the component never compares it.
- **Direction**: render the package only when `filingPackage.returnVersionId === returnVersion?.id` (and optionally `filingPackage.taxYear === workspace.taxYear`), and surface a "could not refresh" note instead of silently keeping the old rows.

### W3 — The parent can keep the old workspace mounted when the year-switch fetch fails

- **Position**: `apps/web/src/app/(workspace)/[householdId]/dashboard/page.tsx:52-82` (`setWorkspace` only inside `if (wsRes.data)`), `:126-127` (`selectedYear` changes immediately), `:433-435` (`key={workspace.id}`).
- **Problem**: on a tax-year change, `selectedYear` updates immediately, but `workspace` remains the old row until `getWorkspace` succeeds. If that request fails, `setWorkspace` is never called; a slower older response can also win. `pageLoading` is not set on a year change (`:50, :93`), so nothing hides the old content. The old workspace id — and therefore the old `key` — stays mounted while the header shows the new year.
- **Impact**: on a failed/out-of-order `getWorkspace`, the Filing tab persistently shows the previous year's "✓ Ready to File", approvals and package under the new year label; on a slow success it shows them for the duration of the request. The component-level F2 state machine is correct; this is the parent assumption it relies on. It is parent-level and pre-existing, so it is recorded rather than blocking the F1/F2 fixes.
- **Basis**: `if (wsRes.data) setWorkspace(wsRes.data)` at `:69-71` has no `else`/clear; the selector at `:126-127`; the key at `:434`; the year list comes from `workspaces` (`:130-132`), so a selected year normally has a row, but the fetch can still fail.
- **Direction**: clear `workspace` when `selectedYear` changes (or gate the render on `workspace.taxYear === selectedYear`), and ignore responses whose year no longer matches the selection.

## 4. Only recorded

- **O1 — Concurrent demo requests**: two tabs can both pass the `findFirst` check (`freelance.service.ts:430-433`) because `Document.sha256Hash` is indexed, not unique (`apps/api/prisma/schema.prisma:329,347`); both can write and both call `invalidateForChange` (`:512-518`), producing duplicate facts and potentially two version bumps. Single-tab double-click is blocked by `disabled={loading}` (`FreelanceBusinessView.tsx:392-397`).
- **O2 — No new gate test**: the direct F1/F2 evidence lives in `tmp/probe-f1-freelance-demo.ts` (13 assertions, re-run) and `tmp/tsconfig.probe-f2.json` (typecheck only), neither part of the eight-suite gate. The prior review's W1 (no service-level `invalidateForChange` / `getHistory` tests) remains open.
- **O3 — `tsc` scope**: the changed `freelance.service.ts`, `FilingPackageView.tsx` and dashboard page are outside `tsconfig.test.json` (`:24-39`); `tsc 0` is a pure-layer signal. The F1 probe tsconfig cannot typecheck either (`tmp/tsconfig.probe-f1.json` resolves `typeRoots` under `tmp/`, where `@types/node` is absent; a CLI override yields only incomplete-stub errors).
- **O4 — Prior non-blocking items unchanged**: the previously recorded unreachable `history.versions.length === 0` branch and the missing diff endpoint are untouched by this round.

## 5. Scope and not covered

### Checks and verdicts

| ID | Check | Verdict | Evidence |
|---|---|---|---|
| F1.1 | `FreelanceModule` imports `ReturnApprovalsModule` | PASS | `freelance.module.ts:6,9`; `return-approvals.module.ts:8-13` imports only Prisma/Audit; `FreelanceModule` is imported only by `app.module.ts:14,31` (no cycle). |
| F1.2 | `FreelanceService` injects `ReturnApprovalsService` | PASS | `freelance.service.ts:14,47-51`; probe constructs the service with the third argument. |
| F1.3 | `loadDemoData` invalidates only when `count > 0` | PASS | `:512-518`; `count++` is inside `if (!existingDoc)` after the fact write (`:430-495`). |
| F1.4 | Generic reason, acting user | PASS | `:513-516` passes `workspaceId`, `actorId`, `'Freelance demo facts loaded'`; no amount/file/business name; controller passes `@CurrentUser('id')` (`freelance.controller.ts:63-65`). Probe asserts the arguments and the absence of `28000`/`Invoice`/`NextWave`. |
| F1.5 | No other unguarded direct `confirmedFact` write | PASS | Repo grep: `facts.service.ts:258/397/502` all call `invalidateForChange` at `:289/420/506`; `freelance.service.ts:477` is the fixed site; only e2e `deleteMany` cleanups elsewhere; no nested `confirmedFact: { create }` and no raw SQL against `confirmed_facts`. |
| F1.6 | No duplicate invalidation | PASS | One call site in the demo (`:512-518`); probe second run: `count 0`, no invalidation; sequential re-click leaves approvals alone. Concurrency caveat in O1. |
| F2.1 | Successful `null` is authoritative | PASS | `FilingPackageView.tsx:61-63` uses `data ?? null`; the API returns 200 `null` for a missing active version/package (`filing.service.ts:1132, 1174`); the client returns `{data: null}` for 200 JSON `null` and `{error}` only for non-2xx (`packages/api-client/src/client.ts:70-119`). |
| F2.2 | State kept only on request errors | PASS | `:61-63` guard on `res.error`; no write on error; `historyLoaded` still flips (`:64`). |
| F2.3 | Reset on `workspace.id` change | PASS | `:67-75` resets `returnVersion`, `filingPackage`, `history`, `historyLoaded` before loading. |
| F2.4 | Dashboard passes `key={workspace.id}` | PASS | `dashboard/page.tsx:433-435`; the only `<FilingPackageView>` render site; `workspace` is replaced from `getWorkspace(householdId, selectedYear)`, so each year has a distinct id. |
| F2.5 | Old stale superseded block removed/correct | PASS | `approvalRecord` now filters `!a.isSuperseded` (`:180-182`); no `approvalRecord?.isSuperseded` remains; `getLatestReturnVersion` already returns only active approvals (`filing.service.ts:1134-1146`), so the removed branch was unreachable. |
| F2.6 | Empty copy says all required approvers | PASS | `:315` — "this draft still needs approval from all required approvers." |
| R1 | Eight suites 179/179 | PASS | Re-ran the exact command: tests 179, suites 30, pass 179, fail 0. |
| R2 | `tsc` 0 | PASS | `tsc -p tsconfig.test.json` exit 0; pure-layer scope only (O3). |
| R3 | Syntax 43/43 | PASS | `syntax_check.cjs` exit 0, 43 `ok` files (adds `freelance.module.ts`). |
| R4 | No other API-5 behavior changed | PASS | Round-2 patch scripts `tmp/fix-api5-1..5.cjs` touch only `freelance.service.ts`, `freelance.module.ts`, `FilingPackageView.tsx`, the dashboard `key`, `syntax_check.cjs`, and the impl doc; `return-approvals.service.ts` / `return-version-history.ts` / DTOs are unchanged. No baseline diff is possible (whole tree uncommitted). |

### Not covered

- **No Nest DI / Prisma / Postgres execution.** The module graph, real `document.create` / `confirmedFact.create`, and `invalidateForChange` against a real approval row were not run. The F1 probe injects an in-memory Prisma fake; the invalidation itself is the unchanged, previously reviewed code. That the demo run supersedes a real row is inferred from that code plus the probe call, not observed against a database.
- **No browser render.** The 2025→2026 switch and the re-approval-after-invalidation scenario were traced through the new code paths and strict-typechecked, not mounted. `dashboard/page.tsx` is only transpiled by `syntax_check.cjs`; it is not in either probe program because it pulls `next/*`.
- **No typecheck of the changed backend service.** `tsconfig.test.json` excludes `freelance.service.ts`; `syntax_check.cjs` transpiles without type checking; the F1 probe's tsconfig cannot typecheck in this sandbox (missing `@types/node`; an override only exposes incomplete stubs). The constructor/module wiring was checked by reading, not by the compiler.
- **No F1/F2 regression test in the gate.** 179/179 is a regression signal, not proof of the fixes. The direct evidence is the F1 probe (13/13, re-run), the F2 strict typecheck (component in the program), and code reading.
- **No baseline commit.** All changes are uncommitted, so "no other API-5 behavior changed" rests on the round-2 patch scripts and a full read of the touched paths, not on a commit diff.

---

**Summary**: The F1 bypass is closed — the demo path now invalidates standing approvals once, with the acting user and a generic reason, only when it actually writes facts, and no other application `confirmedFact` write is unguarded. The F2 stale-state bug is closed for the normal path — successful `null` clears, errors keep state, the component resets on `workspace.id`, and the dashboard keys it. 179/179, `tsc` 0 and 43/43 syntax reproduce. The residuals are failure-path/parent-level (W1-W3) and should be tracked, but they do not block accepting this fix round.
