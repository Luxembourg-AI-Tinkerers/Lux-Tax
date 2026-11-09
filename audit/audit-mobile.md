# Mobile & delivery-baseline audit — Luxembourg personal-tax app

**Date:** 2026-11-08
**Repository:** `B:\B\tax-app`
**Mode:** read-only. The only file written by this audit is this report.
**Question:** are the mobile clients and the delivery baseline at the level `luxembourg-personal-tax-app-plan.md` requires, and do the two status documents describe the repository truthfully?

**Answer in one line:** the three baseline commands pass exactly as advertised, but they cover only the engine and the annex PDF builder; the Expo app is outside the workspace, outside every typecheck/test gate, cannot be built from this repository, and three of its API calls pass a household id where a workspace id is required — so upload, calculation and approval fail at runtime. Separately, `gap-check-2026-11-08.md` §5 is stale and contradicts both its own §3 and tracker Phases 5–7.

---

## 1. Command results (exact)

Run from `B:\B\tax-app`, PowerShell, 2026-11-08. No `pnpm install`.

### 1.1 Tests

```
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts
```

```
ℹ tests 48
ℹ suites 5
ℹ pass 48
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1042.7323
EXIT=0
```

Suites: Annex PDF builder (7) · Art. 118 tariff (5) · Tax year 2025 (4) · Credits (10) · Household scenarios (22).
Cross-check by running the engine spec alone:

```
ℹ tests 41
ℹ pass 41
ℹ fail 0
EXIT=0
```

So the current split is **41 engine + 7 annex PDF = 48**.

### 1.2 Typecheck

```
node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json
EXIT=0
```

No diagnostics printed.

### 1.3 Syntax check

```
node .tools/syntax_check.cjs
EXIT=0
```

Nine files parsed, nine `ok`:
`calculations.service.ts`, `filing.service.ts`, `freelance.service.ts`, `TaxCalculatorView.tsx`, `QuestionnaireView.tsx`, `dashboard/page.tsx`, `FilingPackageView.tsx`, `receipt-ai-vision.service.ts`, `questionnaire.schema.ts`.

### 1.4 What these three commands cover

| Area | Covered by 1.1–1.3? |
|---|---|
| `packages/tax-engine` | yes (41 tests + tsc) |
| `apps/api` annex PDF builder | yes (7 tests + tsc) |
| `apps/api` other modules | syntax only (3 files) |
| `apps/web` | syntax only (4 files) |
| `apps/mobile` | **no** — not in any of the three commands |
| Prisma schema / migrations | no |

The 48-test figure is accurate for what it measures. It measures nothing on mobile.

---

## 2. Why the baseline does not cover mobile

Four independent gates all exclude `apps/mobile`:

1. `tsconfig.test.json` includes only `packages/contracts`, `packages/tax-engine`, `packages/tax-engine/test`, `apps/api/src/modules/filing/annex-pdf.builder.ts`, `apps/api/test/annex-pdf.spec.ts`.
2. `tsconfig.api.json` includes `packages/{contracts,validation,tax-engine}` and `apps/api/src/modules/{calculations,filing,freelance}`.
3. `.tools/syntax_check.cjs` enumerates nine hard-coded web/API paths; no mobile file.
4. Root `package.json` `scripts.test` runs `@luxtax/tax-engine`, `@luxtax/validation`, `@luxtax/api test:e2e`; `turbo.json` has no mobile-specific inputs. `apps/mobile/package.json` has a `typecheck` script, but the package is not a workspace member (see MOB-2), so nothing invokes it.

There are no test or spec files anywhere under `apps/mobile`:

```
Get-ChildItem -Recurse -File apps/mobile | Where-Object { $_.Name -match '\.(test|spec)\.' }
# (no output)
```

Consequence: a mobile file can reference a non-existent client method, or call an existing method with the wrong argument types, and every advertised gate stays green. MOB-1 is exactly that failure mode.

---

## 3. Mobile gap matrix against the plan

Plan references are to `luxembourg-personal-tax-app-plan.md`.

| # | Requirement | Plan | State | Evidence |
|---|---|---|---|---|
| 1 | Expo app, Expo Router shell, shared API client | Phase 1 L1602 | present | `apps/mobile/app/_layout.tsx`, `(tabs)/_layout.tsx`, `src/lib/api-client.ts` |
| 2 | Bottom navigation Home/Documents/Tasks/Estimate/Account | 8.6 L518–528 | present | `(tabs)/_layout.tsx` L24–57 (plus hidden `activity`) |
| 3 | Secure token storage (Keychain/Keystore) | 8.9 L564–565 | present | `expo-secure-store` in `src/lib/secure-storage.ts` |
| 4 | Protected routes + device sessions | Phase 1 L1603 | **missing** | no guard in `app/_layout.tsx` L9–12; no session list anywhere |
| 5 | Biometric re-entry | 8.9 L567 | **missing (inert UI)** | `account.tsx` L24 state default `true`, L151–153 local switch only; no auth library in `package.json` |
| 6 | Reauthenticate for final approval | 8.9 L569, Phase 5 L1694 | **missing** | `estimate.tsx` L55–66, button L196–201 |
| 7 | Hide content in app switcher | 8.9 L572 | missing | no `AppState` usage in `apps/mobile` |
| 8 | Deep links (Universal/App Links) | 8.10 L578–586 | **missing** | `app.json` L45 `scheme` only; no `associatedDomains`/`intentFilters`; no invite route |
| 9 | Invitation accept flow | 8.10 L580 | **missing** | client has `getInvitationDetails`/`acceptInvitation` (`packages/api-client/src/client.ts` L172, L178), never called; `account.tsx` L59/L137 shows raw token |
| 10 | Push notifications + routing + preferences | 8.11 L590–596, Phase 3 L1651 | **missing** | no `expo-notifications` dependency, no handler, no settings UI |
| 11 | Offline capture, encrypted queue, retry, status | 8.8 L552–558 | **missing** | no queue/netinfo/filesystem dependency; `DocumentCameraScanner.tsx` L161 single shot |
| 12 | Resumable upload + checksum | 8.7 L544, Phase 2 L1628 | **missing** | one base64 POST, no chunking/resume |
| 13 | Multi-page scan, reorder, rotate, quality checks | 8.7 L534–541 | **missing/partial** | single asset only; `allowsEditing: true` crop; no page model, no blur/glare check |
| 14 | Owner selection, tax-year selection | 8.7 L542–543 | **missing** | owner never sent; tax year hardcoded 2025 (5 screens) |
| 15 | Filing package download/share | Phase 5 L1694 | **missing** | no `getFilingPackage`/`generateFilingPackage` call; no sharing module; client methods exist at L370/L398 |
| 16 | Mobile-native questionnaire | Phase 3 L1651 | **missing** | `tasks.tsx` L41–52 posts a hardcoded profile (MOB-4) |
| 17 | Tasks parity (resolve/assign) | Phase 3 L1651 | partial | read-only list; `resolveTask` exists in client L341, unused |
| 18 | Household activity parity | Phase 3 L1651 | partial | read-only list, limit 20, no comments/assignments (`activity.tsx` L21) |
| 19 | Household / tax-year switching | 8.6 L528 | **missing** | `hhRes.data[0]` in 5 screens; `2025` hardcoded in 6 places |
| 20 | Mobile device test matrix | 20.1 L1476–1477, 20.2 L1498–1500 | **missing** | no device/E2E harness, no CI |
| 21 | Release config, EAS, store artefacts | 8.12 L600–611 | **missing** | no `eas.json`, no env configs, `.github` holds only `dependabot.yml` |
| 22 | Mobile performance measurement | 8.13 L613–626 | not started | no cold-start/FPS/memory instrumentation |

---

## 4. Findings

Severity: **P0** = mobile is unusable or unsafe for a core tax action; **P1** = a plan-mandated mobile capability absent or wrong; **P2** = parity/quality gap.
Status uses the requested vocabulary: `missing` · `partial` · `incorrect` · `doc-stale`.

### MOB-1 — Three mobile API calls pass a household id where a workspace id is required

- **Status:** incorrect
- **Priority:** P0
- **Evidence:**
  - `packages/api-client/src/client.ts` L224 `async uploadDocument(workspaceId: string, body: UploadDocumentRequestDto)`; L351 `async calculateTax(workspaceId: string)`; L364 `async approveReturn(workspaceId: string)`.
  - `apps/mobile/src/components/DocumentCameraScanner.tsx` L161–166:
    ```ts
    const res = await mobileApiClient.uploadDocument(householdId, taxYear, {
      fileName: captured.fileName, ...
    ```
    Caller passes `householdId` and `taxYear=2025` (`documents.tsx` L242). The client takes two arguments, so `taxYear` becomes `body` and the object literal is discarded.
  - `apps/mobile/app/(tabs)/estimate.tsx` L44 `calculateTax(householdId, 2025)` and L58 `approveReturn(householdId, 2025)`.
  - Ids are distinct: `TaxYearWorkspace.id` is its own uuid (`apps/api/prisma/schema.prisma`, `model TaxYearWorkspace`).
  - Upload path: `apps/api/src/modules/documents/documents.controller.ts` L27–40 validates the body **before** any lookup; `2025` fails `uploadDocumentSchema` (`packages/validation/src/document.schema.ts`) → **400 “Validation failed”**, surfaced to the user as “Upload Failed”.
  - Calculate/approve path: `HouseholdGuard` looks up `taxYearWorkspace` by `workspaceId`; not found → `householdId` stays undefined → guard returns `true` (fail-open, `apps/api/src/common/guards/household.guard.ts` L30–43). The service then throws `NotFoundException('Workspace not found')` (`documents.service.ts` L43–49; same pattern in calculations/filing) → **404**.
  - The same app uses workspace ids correctly for reads (`documents.tsx` L33–40 uses `wsRes.data.id`), so this is an inconsistent wiring, not a modelling choice.
- **Why it matters:** the three user-visible actions the mobile app exists for — scan a receipt, recalculate, approve the return — cannot succeed against the current API. The green baseline cannot see it (MOB-2).
- **Proposal:** resolve the workspace once per screen (`getWorkspace(householdId, year).data.id`) and pass it; change `DocumentCameraScanner` props from `householdId/taxYear` to `workspaceId`; send `documentType: selectedType`; drop the extra `2025` arguments.
- **Acceptance:** a mobile integration test (or a typed call-site check) asserting `uploadDocument(workspaceId, body)`, `calculateTax(workspaceId)`, `approveReturn(workspaceId)`; manual device run: scan → 201, recalculate → 200, approve → 200 on a seeded workspace.

### MOB-2 — Mobile is outside the monorepo build, install and verification pipeline

- **Status:** missing
- **Priority:** P0
- **Evidence:**
  - `pnpm-workspace.yaml` lists `packages/*`, `apps/api`, `apps/web` only. Root `package.json` `workspaces` repeats the same three globs. `apps/mobile` is therefore not a workspace package, although README L184 documents `pnpm --filter @luxtax/mobile start`.
  - `pnpm-lock.yaml` has importers for `apps/api` (L21) and `apps/web` (L136) only — no `apps/mobile` importer.
  - `apps/mobile/app.json` references `./assets/icon.png`, `./assets/splash-icon.png`, `./assets/adaptive-icon.png`; **there is no `apps/mobile/assets` directory**.
  - No `eas.json`; `.github` contains only `dependabot.yml` — no CI, no signing, no TestFlight/Play tracks (plan 8.12 L600–611).
  - Mobile is absent from `tsconfig.test.json`, `tsconfig.api.json`, `.tools/syntax_check.cjs`, root `test` script and `turbo.json` (§2 above).
- **Why it matters:** the delivery baseline cannot install, typecheck, test or build the mobile client. `expo prebuild`/EAS fails on the missing icon assets; `pnpm --filter @luxtax/mobile` matches no project. This is why MOB-1 and MOB-4 could ship while every gate reported success.
- **Proposal:** add `apps/mobile` to both workspace manifests and regenerate the lockfile; add real icon/splash assets; add a `typecheck` job that runs `tsc --noEmit` against Expo types; add at minimum a compile gate for mobile TSX to `syntax_check.cjs` as an interim; add EAS build profiles and a CI workflow.
- **Acceptance:** `pnpm --filter @luxtax/mobile exec tsc --noEmit` runs and is part of the documented verification; `expo prebuild --no-install` (or `eas build --profile preview`) succeeds with the committed assets; CI workflow runs the mobile typecheck on every push.

### DOC-1 — `gap-check-2026-11-08.md` §5 declares delivered work incomplete

- **Status:** doc-stale
- **Priority:** P0
- **Evidence:**
  - `gap-check-2026-11-08.md` L97: “**Not complete, and not claimed:** securities-level capital, rental amortisation, mixed-couple Art. 3 d) enforcement, the 2028 transition, annex PDF generation, and execution of the database migration.”
  - The **same document**, §3, marks those items closed: L63 R8 annexes “✅ closed … (7 tests)”, L60 R3 Art. 3 d) “✅ closed”, L61 R4 “✅ hook”, L67 R9 migration “✅ closed”; R2 rental is cited in §4 L80 as implemented via R1/R2/R3.
  - `implementation-tracker.md` L254 R3 ✅, L257 R2 ✅ (“4 % / 1.5 % / 2 % / 3 % + energy rate”), L258 R8 ✅ (“7 tests”), L262 R9 ✅, Phase 6 L450 (annex PDF generation), Phase 7 L401 (migration executed).
  - The code and the run agree with the tracker, not with §5: the suite contains `rental asset register: amortisation by age and energy rate`, `Art. 3 d): mixed couple gets Class 2 only at >= 90 % LU professional income`, `2028 single-class package is a preview and warns`; the annex PDF suite contributes 7 passing tests; three migration folders exist under `apps/api/prisma/migrations` and `.tools/pgdata` exists.
- **Nuance that must not be flattened:** the 2028 item is genuinely only a hook. Tracker L28 and L506 say transition rules are **not modelled**; R4’s “✅ 2028 transition” (L259) overstates a `classUTransition { method: 'NONE' }` placeholder. For 2028 the correct statement is “hook present, transition not modelled”; for the other four items §5 is simply wrong.
- **Why it matters:** the two documents a reviewer would trust for status give opposite answers on five items, same day. One of them will be copied into a release note or a client update.
- **Proposal:** rewrite §5 as “closed since this check: rental amortisation, Art. 3 d), annex PDFs, migration execution; still limited: 2028 transition is a hook only, CIC 2026 and loi 8775 are gated on unpublished texts”. Restate R4 as “partial — hook only” so the tracker matches L28/L506.
- **Acceptance:** no sentence in either document asserts an item is both closed and not complete; grep for “Not complete” returns only the externally blocked items.

### MOB-3 — Final approval is reachable with no biometric re-entry, confirmation or route guard

- **Status:** missing
- **Priority:** P0
- **Evidence:**
  - `apps/mobile/app/(tabs)/estimate.tsx` L200–205: the “Approve Return Version vN” button calls `handleApproveReturn` directly; L55–66 posts the approval with no confirmation sheet, no amount/version re-display, no local authentication.
  - Plan 8.9 L569: “Reauthenticate for high-risk actions such as household removal, data export, and final approval”; Phase 5 L1694: “biometric re-entry for approval”.
  - `apps/mobile/app/(tabs)/account.tsx` L24 `useState(true)` and L151–153: the “Biometric Re-entry” switch changes local component state only; it is not persisted, not read anywhere, and no biometric API exists in `package.json` (no `expo-local-authentication`).
  - L163 prints a static “Active (AES-GCM)” badge — a claim about behaviour that is not implemented.
  - `apps/mobile/app/_layout.tsx` L9–12 mounts `index`, `(auth)/login`, `(tabs)` with no auth guard or redirect; `app/index.tsx` checks the token once for the entry route, but a deep link straight to `/(tabs)/estimate` mounts the tab navigator without any check. Server authorisation still protects data, so this is a UI/device-protection gap, not a data breach.
- **Why it matters:** approval is the legally consequential action in the product (both spouses must approve the same immutable version). On mobile it is one tap, available to anyone holding the unlocked device, with no proof of presence and no version confirmation.
- **Proposal:** gate approval behind `expo-local-authentication` (biometric or device-credential fallback), show a confirmation sheet with return version + estimated balance, persist the biometric preference, and add a root-layout guard using `useSegments`/`Redirect`. Remove or wire the “AES-GCM” badge.
- **Acceptance:** on device, approval requires a successful local-authentication prompt; cancelling it makes no network call; cold start on `/(tabs)/estimate` without a token redirects to login; the account switch survives an app restart and actually disables/enables the prompt.

### MOB-4 — Tasks screen writes a hardcoded tax profile and calls a method that does not exist

- **Status:** incorrect
- **Priority:** P1
- **Evidence:**
  - `apps/mobile/app/(tabs)/tasks.tsx` L41–52 calls `mobileApiClient.submitTaxProfile(householdId, 2025, { taxResidence: 'RESIDENT', maritalStatus: 'MARRIED', hasChildren: false, dependantsCount: 0, hasEmploymentIncome: true, ... hasPrimaryResidenceMortgage: true, mortgageOccupancyYear: 2025, hasInsuranceDeductions: true })`.
  - `packages/api-client/src/client.ts` has **no** `submitTaxProfile`; the questionnaire API is `getQuestionnaire` L322 and `saveQuestionnaire(workspaceId, body)` L331. At runtime this is `TypeError: ... is not a function`, inside an async handler invoked without `catch` (L106 `onPress={handleResolveQuestionnaire}`), so the tap fails silently and the “Profile Saved” alert never appears.
  - The card is labelled “Update Tax Profile Questions” but opens no questions; every value is invented in code.
- **Why it matters:** Phase 3 L1651 requires a “mobile-native questionnaire”. There is none. If the method name were corrected without fixing the payload, one tap would overwrite a spouse’s real answers with a fabricated married/mortgage/insurance profile — a data-integrity incident on a tax return.
- **Proposal:** build a real questionnaire screen bound to `getQuestionnaire`/`saveQuestionnaire` on the workspace id, with per-field provenance; delete the hardcoded payload. Until then, remove the card.
- **Acceptance:** no mobile code path submits tax answers the user did not enter; the questionnaire screen round-trips saved answers; a test asserts the client method name and workspace-id argument.

### MOB-5 — No offline capture or interrupted-upload recovery

- **Status:** missing
- **Priority:** P1
- **Evidence:**
  - `DocumentCameraScanner.tsx` L161–183: one `uploadDocument` POST with a full base64 payload held in component state; on failure it only shows `Alert.alert('Upload Failed', ...)` (L177–181). Nothing is persisted, queued or retried.
  - No `@react-native-community/netinfo`, `expo-file-system` or queue dependency in `apps/mobile/package.json`; no local database.
  - No offline/sync indicator in any screen; screens call the API in `useEffect` and render empty on failure.
  - Plan 8.8 L552–558 requires offline capture, encrypted pending-upload queue, retry on reconnect, draft metadata, visible sync status and conflict-safe reconciliation; Phase 2 exit criterion L1638 requires “interrupted-upload recovery” to pass real-device tests.
- **Why it matters:** receipt capture happens in the field, frequently on poor connectivity. A dropped connection loses the scan and the user’s work; the plan’s Phase 2 exit criterion cannot be met.
- **Proposal:** persist captured files to an encrypted app-private directory with a queue record (workspace, owner, visibility, checksum), retry with backoff, expose sync state in Documents, delete the local copy after server confirmation.
- **Acceptance:** airplane-mode capture survives app restart and uploads automatically on reconnect; a killed upload resumes without duplicating the document (server hash dedupe honoured); queue depth and last error are visible.

### MOB-6 — No deep links and no invitation acceptance

- **Status:** missing
- **Priority:** P1
- **Evidence:**
  - `apps/mobile/app.json` L45 declares `"scheme": "luxtax"` only. There is no `ios.associatedDomains` and no `android.intentFilters`, so no verified Universal/App Links (plan 8.10 L578).
  - No route exists for an invitation (`apps/mobile/app` contains only `index`, `(auth)/login`, `(tabs)/*`).
  - `packages/api-client/src/client.ts` L172 `getInvitationDetails(token)` and L178 `acceptInvitation(body)` are never called from mobile.
  - `account.tsx` L59 puts the raw invitation token into an `Alert`, and L135–137 renders it in a `tokenBox` on screen. Plan 8.10 L586 says invitation tokens are single-use, short-lived and must never travel in a link; displaying them in a screenshot-able dialog is the same class of exposure.
  - `expo-linking` is a dependency but unused.
- **Why it matters:** spouse onboarding — the core collaboration promise (Phase 1 exit L1607, L1612) — cannot happen on mobile. Token display in an alert is a credential-handling smell.
- **Proposal:** add `app/invite/[token].tsx` that resolves `getInvitationDetails`, authenticates/registers, then `acceptInvitation`; configure associated domains / intent filters; send the invitation by email or share sheet instead of rendering the token.
- **Acceptance:** a physical device opens `https://<host>/invite/<token>` into the app, unauthenticated users land on login and return to the invite after auth, and the token never appears in an alert or on-screen label.

### MOB-7 — No push notifications, routing or preferences

- **Status:** missing
- **Priority:** P1
- **Evidence:**
  - No `expo-notifications` (or any push) dependency in `apps/mobile/package.json`; no notification handler, channel setup, device-token registration or permission request in the source tree.
  - `account.tsx` has no notification preferences section (only biometrics + a static storage badge).
  - Plan 8.11 L590–596 defines allowed copy and forbids financial detail on the lock screen; Phase 3 L1651 requires “push-notification routing”; 20.2 L1499 requires push content to contain no tax values.
- **Why it matters:** deadline and approval nudges are a product requirement, and the household collaboration loop (“your joint return is ready for approval”) has no delivery channel on mobile.
- **Proposal:** register for push after login, store the device token server-side, add per-category preferences, route taps through the authenticated screen, and keep payloads to the three approved generic strings.
- **Acceptance:** a test push opens the correct screen after revalidation; payload inspection shows no amounts, names or document titles; opt-out is honoured server-side.

### MOB-8 — No filing-package download or share on mobile

- **Status:** missing
- **Priority:** P1
- **Evidence:**
  - No mobile screen calls `generateFilingPackage` (`client.ts` L370), `getFilingPackage` (L398) or the annex PDF endpoint (`apps/api/src/modules/filing/filing.controller.ts` L85).
  - No `expo-sharing`/`expo-file-system` dependency; no download, print or share control anywhere under `apps/mobile`.
  - Plan Phase 5 L1694 explicitly lists “package download/share controls” as a mobile objective; the web equivalent exists (`FilingPackageView.tsx`, blob download).
- **Why it matters:** a filer who approves on mobile cannot retrieve the package they approved, so the mobile flow stops one step short of the product’s purpose.
- **Proposal:** add a Filing section on Estimate (post-approval): generate/view package, download annex PDF to app storage, share via the OS share sheet with a warning that the file contains tax data.
- **Acceptance:** on device, an approved return produces a downloadable PDF that opens in a viewer and can be shared; the file is written to a protected directory and deleted on logout.

### MOB-9 — No household or tax-year switching; 2026 is unreachable on mobile

- **Status:** partial
- **Priority:** P2
- **Evidence:** `hhRes.data[0]` is used as “the” household in `index.tsx` L27, `documents.tsx` L30, `tasks.tsx` L24, `estimate.tsx` L27, `activity.tsx` L21, `account.tsx` L31. `2025` is hardcoded in `index.tsx` L31–32/L69, `documents.tsx` L33/L242, `tasks.tsx` L27/L41/L50, `estimate.tsx` L30/L44/L58/L91/L118, `_layout.tsx` L46. Plan 8.6 L528 requires household and tax-year switching through contextual menus; the engine supports 2025 and 2026.
- **Why it matters:** a user in two households sees the wrong one; a 2026 filer cannot use mobile at all, despite the engine supporting 2026.
- **Proposal:** a workspace context (household + year) in a small store, a switcher in the header, and removal of every literal `2025`.
- **Acceptance:** switching household/year changes every screen’s data; no `2025` literal remains in screen code.

### MOB-10 — Capture UI overstates what it does; document classification is dead code

- **Status:** incorrect
- **Priority:** P2
- **Evidence:** `DocumentCameraScanner.tsx` L269–278 maps five different labels (“Work Expense”, “Course / Training”, “Daycare / Crèche”, “Medical Bill”) to the same `DocumentType.CHILDCARE_INVOICE`, and `selectedType` (L43) is never included in the upload payload (L161–166), so the choice has no effect. `documents.tsx` L150–161: the “Upload File / Photo” button opens the same camera modal. README L52 claims “real-time border detection, document cropping” — the implementation uses `ImagePicker.launchCameraAsync` with `allowsEditing: true`, i.e. a still capture and a manual crop, no border detection.
- **Why it matters:** classification drives extraction and downstream fact typing; a UI that silently mislabels a medical bill as childcare is worse than no selector.
- **Proposal:** send `documentType`, give each chip its own enum value, add a distinct file-picker entry point, and correct the README claim.
- **Acceptance:** the chosen type reaches the API (assert in payload); each chip maps to a distinct enum; README no longer claims border detection.

### MOB-11 — Activity and task parity stop at read-only lists

- **Status:** partial
- **Priority:** P2
- **Evidence:** `activity.tsx` L21 fetches `{ limit: 20 }` and renders a flat list — no pagination, filtering, comments or assignments. `tasks.tsx` renders `readiness.missingItems` but never calls `resolveTask` (`client.ts` L341), so a task cannot be actioned from mobile. Plan Phase 3 L1651 requires questionnaire, tasks, household activity and push routing on mobile.
- **Why it matters:** “both spouses can see material changes and assigned tasks” (Phase 3 exit L1658) is only half met — they can see them, not act.
- **Proposal:** task detail with resolve action, paginated/incremental activity, and comment/assignment support once the API exposes it.
- **Acceptance:** a blocker task can be resolved from mobile and disappears from the list after refresh; activity paginates beyond 20 items.

### DOC-2 — Stated test and check counts are stale and mutually inconsistent

- **Status:** doc-stale
- **Priority:** P1
- **Evidence:**
  - `gap-check-2026-11-08.md` L5 “(33 golden tests …)”, L15 “✅ **33 / 33 pass**”, L89 “33 golden tests … was 32 before the CISSM test”.
  - `implementation-tracker.md` L79 “**32 / 32 pass**”; L201 “**36 / 36 pass**”; L203 “**43 / 43 pass**”; L207 44; L208 47; L210 “**48 / 48 pass**”; header L7 “48 tests passing (41 engine + 7 annex PDF)”.
  - Actual run today: **41 engine + 7 annex = 48**, exit 0. Engine-only re-run: 41/41.
  - `gap-check` L18 “8 / 8 ok” for the syntax check; actual is **9 files, 9 ok** (tracker L52 and the run agree on 9).
- **Why it matters:** 33 and 43 are both wrong today; 48 is right. A reader cannot tell which number is current, and the “8/8” understates the gate that actually exists.
- **Proposal:** keep one count in one place — the tracker header — and date-stamp historical entries; replace §1 tables in the gap check with “as of 2026-11-08: 41 engine / 7 annex / 48 total”.
- **Acceptance:** both documents state 41/7/48 and 9/9; no undated count remains.

### DOC-3 — Tracker contradicts its own status table in three places

- **Status:** doc-stale
- **Priority:** P1
- **Evidence:**
  - `implementation-tracker.md` L477: “Remaining partials, with reasons: R1 … R2 … R3 … R4 … R5 … R6 … R7 … R8 … R9 … R10” — while L252–262 mark every one of R1–R10 ✅, and Phases 6–7 (L450, L401) document R8/R9 as executed.
  - L501: “**CIC 2026** — not modelled; a warning says so.” — contradicts L244 (4.5: “CIC is **explicitly flagged**… mechanism”) and L260 (R6: `CicRules` + `cicForSalary()` + safety gate, “tested both states”). “Gated” ≠ “not modelled”.
  - L7: “**Phase 1–9 implemented**” — Phases 10 (L292) and 11 (L264) also exist, and there is no mobile phase or status row anywhere in the tracker despite the plan’s Phase 1–5 mobile objectives.
- **Why it matters:** the tracker is the artefact quoted in release discussions; a “remaining partials” paragraph listing ten closed items will be read as ten open risks.
- **Proposal:** delete L477, correct L501 to “gated on the unpublished 2026 table”, change L7 to “Phases 0–11 (engine/API/web)” and add a mobile section stating the actual state.
- **Acceptance:** tracker contains no list that contradicts its own status column; mobile appears in the tracker with an explicit status.

### DOC-4 — Gap-check §4 still reports the Prisma migration as unapplied

- **Status:** doc-stale
- **Priority:** P2
- **Evidence:** `gap-check-2026-11-08.md` L85 “Prisma migration | 🟡 | authored, not applied (R9)” — contradicts the same document’s L67 (R9 ✅ closed: 3 migrations applied, no drift) and tracker Phase 7 L401–448. Artifacts on disk: three migration folders (`20261108000000_init`, `20261108120000_add_fact_category_values`, `20261108130000_add_filing_annexes`) and `.tools/pgdata`.
- **Why it matters:** “not applied” is the single claim that most changes a reviewer’s risk assessment of a schema change.
- **Proposal:** delete the row or mark it “superseded by R9 (see §3)”.
- **Acceptance:** no document states the migration is unapplied.

### Documentation claims outside the two status files (for completeness)

| Claim | Location | Reality |
|---|---|---|
| “real-time border detection, document cropping” | `README.md` L52 | still-image capture + manual crop; no border detection (MOB-10) |
| `pnpm --filter @luxtax/mobile start` | `README.md` L184 | package is not a workspace member; the filter matches nothing (MOB-2) |
| “native iOS/Android mobile clients” available | `README.md` L12, L89 | no assets, no EAS config, no CI, cannot build (MOB-2) |
| “9 touched web/API files (must print 9 x ok)” | `implementation-tracker.md` L52 | **correct** — the run prints 9 |

---

## 5. Test-count reconciliation

| Stated | Where | Verdict |
|---|---|---|
| 32 | tracker L79 (Phase 0.4) | historical (pre-CISSM), stale as a status |
| 33 | gap-check L5, L15, L89 | stale — engine is 41 |
| 36 | tracker L201 | historical intermediate |
| 43 | tracker L203 | historical intermediate; not current |
| 44 / 47 | tracker L207–208 | historical intermediates |
| 48 | tracker L7, L210 | **correct** — 41 engine + 7 annex, verified today |
| 8 / 8 syntax | gap-check L18 | stale — 9 files |
| 9 / 9 syntax | tracker L52 | **correct**, verified today |

The user-visible numbers 33, 43 and 48 therefore resolve as: 33 and 43 are superseded snapshots; **48 is the only current figure**.

---

## 6. What was not verified

- No device or simulator run: Expo/React Native dependencies are not installed (mobile is not a workspace package), so runtime behaviour in MOB-1 is inferred from signatures, guards and validation order — not observed on a device.
- The PostgreSQL cluster was not restarted; the migration “applied / zero drift” claim is corroborated by the three migration folders and `.tools/pgdata`, not re-executed.
- No legal values were checked in this audit; CIC 2026 and loi 8775 remain externally blocked and are out of scope here.
- Web/iOS/Android visual parity was not assessed beyond the missing capabilities listed.

---

## 7. Suggested order of work

1. **MOB-2** first — make mobile a workspace package with assets and a typecheck gate. Without it, every later fix is unverifiable.
2. **MOB-1** — correct the three call sites; the typecheck from step 1 will then prove it.
3. **DOC-1 / DOC-2 / DOC-3** — one editing pass over both status documents; they currently disagree with each other and with the run.
4. **MOB-3** — biometric + confirmation before approval; it is the highest-consequence interaction.
5. **MOB-4 / MOB-5 / MOB-6 / MOB-7 / MOB-8** — questionnaire, offline queue, deep links, push, package download, in that order (each unblocks a Phase 1–5 exit criterion).
6. **MOB-9 / MOB-10 / MOB-11** — parity and honesty clean-up.

---

## Appendix — commands used

```powershell
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts   # 48 pass, exit 0
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts                                  # 41 pass, exit 0
node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json                                                                                          # exit 0
node .tools/syntax_check.cjs                                                                                                                               # 9 ok, exit 0
```
