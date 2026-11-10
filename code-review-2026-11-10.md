# Full code review — 10 November 2026

**Scope:** the whole repo (~30 k lines of TS/TSX: `apps/api` 11.4 k, `apps/web` 7.7 k,
`packages` 9 k, `apps/mobile` 2 k) plus schema, migrations, build and test configuration.

**Method.** Six independent reviewers covered authorization, API business logic, the web client, the
tax engine and contracts, the data layer, and cross-cutting engineering quality. Their output was
then **verified**: I reproduced every Critical and most High findings myself — in the running
browser, against the live API, or numerically against the compiled engine. Findings that I could not
reproduce are marked as such rather than repeated.

This is a static review with targeted runtime probes. It is not a penetration test, and no mobile
build or assistive-technology run was performed.

---

## Verdict

**Not ready to handle a real return.** The tax engine has a silent, reachable correctness bug that
inflates a pensioner's taxable income, and one income line that is never taxed at all. On the web
side, the login screen cannot report a wrong password, sessions die after 15 minutes, and two clicks
on a demo button triple the declared salary.

The foundations are better than that sounds: tenant isolation is genuinely deny-by-default, the
admin allowlist is correct, money arithmetic is integer cents, argon2id parameters are sound, upload
paths are sanitised, and there is no HTML-injection sink anywhere in the web app.

---

## Critical

### C1. A pension withholding is taxed as pension income
`packages/tax-engine/src/engine.ts:312-315`

```ts
case 'PENSION_INCOME':
  bucket.grossPension = addMoney(bucket.grossPension, amount);              // every fact
  if (effectiveFieldKey === 'withholdingTax') bucket.pensionWithholding = …
```

Every pension fact is added to gross income; the `withholdingTax` key is *additionally* recorded as
withheld. Capital and rental facts branch on `fieldKey`; pension does not.

**Reproduced** (compiled engine):
```
pension 20 000 only         gross=20000  taxable=19220  final=0
pension 20 000 + 3 000 wh.  gross=23000  taxable=22220  final=122.85
```
The withholding adds €3,000 of income and turns a €0 liability into €122.85 payable. **Fix:** branch
on `fieldKey`, as the capital and rental cases already do.

### C2. A standalone qualifying dividend is never taxed
`engine.ts:562-565` vs `engine.ts:319-321`

The 50 % exemption is computed as `min(qualifyingDividends, capitalIncome) * 0.5`, but a
`qualifyingDividend` fact fills only `qualifyingDividends`, never `capitalIncome` — and the web form
offers that line as a standalone entry (`FactsView.tsx:33`).

**Reproduced:**
```
salary 60 000 only            taxable=58980
+ qualifyingDividend 10 000   taxable=58980   ← unchanged; the €10 000 disappears
+ capitalIncome      10 000   taxable=68955   ← +9 975, as expected
```
Two answers for the same €10,000: the securities ledger exempts half correctly, the fact path taxes
nothing. **Fix:** treat the dividend as gross capital income with a 50 % exemption, or reject a
dividend larger than `capitalIncome` with a warning.

### C3. The JWT signing key falls back to a literal that is in the repository
`jwt.strategy.ts:18`, `auth.service.ts:36`, `auth.module.ts:15` — the same string three times:

```ts
process.env.JWT_ACCESS_SECRET || 'dev_luxembourg_tax_jwt_access_secret_32chars_min_2026'
```

No config validation exists at boot, so a deployment that forgets the variable starts happily and
signs HS256 with a public constant. `HouseholdGuard` authorises purely on `request.user.id`, so a
forged `{sub:<victimId>}` token reaches every household that user belongs to.

Conditional on the environment, but the code offers no guard rail. **Fix:** validate at boot and
refuse to start without a ≥32-byte secret (and delete the literal).

---

## High

### H1. A VIEWER can recalculate the return and invalidate both approvals
`calculations.controller.ts:21`

`@Post('calculate')` carries no `@Roles(...)`. `HouseholdGuard` enforces roles **only when the
decorator is present** (`household.guard.ts:77-84`), so any ACTIVE member passes. `calculateTax`
then overwrites `calculationResult`, changes the status and calls `invalidateForChange`, superseding
every standing approval. A read-only collaborator can therefore destroy the state a couple spent
the evening approving. `POST /households/:id/workspaces` and `POST …/tasks/:id/resolve` have the same
gap — the latter lets a viewer silence a BLOCKER readiness task.

**Verified** by reading the route and the guard. **Fix:** `@Roles(PRIMARY_FILER, CO_FILER)` on all
three mutating routes.

### H2. A wrong password produces no message — the page reloads instead
`apps/web/src/lib/api.ts:13-18` + `packages/api-client/src/client.ts:102-104`

`onUnauthorized` is global and fires on *every* 401, including the login request itself; it wipes the
tokens and sets `window.location.href = '/login'` before the page can render `res.error`.

**Reproduced in the browser:** submitting a wrong password navigates (the automation lost the page
mid-evaluate), returns to an empty form, and shows no error text.

**Fix:** skip `onUnauthorized` for the auth endpoints, or have it return an error instead of
navigating.

### H3. Sessions expire after 15 minutes with no refresh, and logout never revokes on the server
`apps/web/src/lib/api.ts` (no refresh path), `auth-context.tsx:54`

`refreshToken()` exists in the client and is **called nowhere** in `apps/web/src`. On a 401 the user
is thrown to `/login` mid-form. Worse, `logout()` posts to a literal `http://localhost:3001`, so in
any deployed build the server-side session stays valid for its full 7 days.

**Verified** by grep (`refreshToken(`: zero hits; `localhost:3001`: one hit).

**Fix:** call the refresh endpoint before redirecting, and derive the base URL from the same config
the client uses.

### H4. Two clicks on "Quick Load demo facts" triple the declared salary
`FactsView.tsx:169-205`

The demo loader re-creates all six facts on every click, never checks `demoRes.error`, and the API
inserts rather than upserts (`facts.service.ts:253`). The engine sums.

**Reproduced in the browser:** confirmed facts 7 → 13 → 19, `TOTAL CONFIRMED GROSS SALARY
€225,000.00`, while the toast said "Loaded 6 realistic 2025 Luxembourg tax facts" each time. The
questionnaire's quick-estimate inputs have the same shape (`QuestionnaireView.tsx:92-130`).

**Fix:** guard the demo load (idempotent keys or a confirm), surface the error, and clear the quick
inputs after a successful save.

### H5. The filing package prints deductions and credits as income
`filing.service.ts:576-600`

`CAPITAL_INCOME` and `RENTAL_INCOME` emit **every** fact of the category to CM 901 / L 1001 as a
positive amount, ignoring `fieldKey` — while the engine branches on that same key
(`engine.ts:318-326`). A 15 % withholding (a credit) and `rentalCharges` (a deduction) are therefore
printed as income on the form the taxpayer copies. Gross rent 24,000 + charges 4,800 → two rows on
case 1001.

**Verified by reading both the emitter and the engine.** **Fix:** branch on `fieldKey` here too, and
print charges as a negative line.

### H6. A joint return can never be filed when a VIEWER is an active member — **RESOLVED**

`filing.service.ts`, `recordFiling` (was line 1205 at review time, now 1222)

At review time this gate rebuilt the required-approver list itself instead of calling the shared
helper, so it counted VIEWERs while `approveReturn` and the history badge excluded them. A Class 2
household with a viewer reached `APPROVED` and then answered 400 on filing forever, because a
VIEWER is forbidden from approving (403).

**BEFORE (the defect):**

```ts
// recordFiling — rebuilt the list, VIEWER included
const requiredMemberIds = workspace.household.members.map((member) => member.userId);
```

**AFTER (current source, compiled output and e2e agree):**

```ts
// recordFiling — same helper as approveReturn and the history builder
const requiredMemberIds = requiredApproverIds(workspace.household.members);
```

This was the call site the earlier PROD-2 fix missed — the reason the rule belongs in one place.

**Closed 2026-11-10, with three independent guards:**

1. **Source invariant** — `apps/api/test/prod2-source-invariant.spec.ts` (4 tests) asserts that
   `filing.service.ts` calls `requiredApproverIds` exactly **three** times, that no gate rebuilds the
   list from household members, that the helper filters `VIEWER` and nothing else, and that no other
   module in `apps/api/src` maps `household.members` into approvers. Reverting the line above makes
   **3 of its 4 tests fail**.
2. **End-to-end** — `apps/api/test/viewer-approver.e2e-spec.ts` (6 tests) builds a Class 2 household
   of two filers plus a VIEWER through the public API, shows the viewer gets **403** on approve,
   shows both filers reaching `APPROVED`, and then **files the return (201)**. Reverting the same
   line makes **3 of those 6 fail**, with the exact 400 "Every required household member must
   approve" the finding predicted.
3. **Compiled artifact** — `apps/api/dist/.../filing.service.js` calls the helper at all three sites
   (rebuilt after the fix), so what the server actually runs matches the source.

### H7. The Art. 115 n° 15 capital tranche is reported but not applied
`engine.ts:637-640` computes `capitalAfterTranche`; `engine.ts:681` passes the **gross** value on.

**Reproduced:** adding €5,000 of capital income raised taxable income by €4,975, while the
`LIR-ART-115-15` provenance line reports `outputAmount: 3500`. The tax on every capital-income
return is overstated by up to €1,500 (single) / €3,000 (couple), and the breakdown shown to the user
disagrees with the total.

The existing test asserts only the provenance line, which is why it passes.

### H8. The audit chain forks under concurrent writes
`audit.service.ts:33-58`

Reading the tip (`findFirst … orderBy createdAt desc`), computing `prevHash`, and inserting are three
separate operations with no transaction and no lock. Two events in the same household at the same
moment chain from the same predecessor; the trigger makes it unfixable afterwards, and `createdAt`
ordering cannot disambiguate two rows in the same millisecond.

The chain *verification* code is well built (canonical JSON, sorted keys, tamper detection) — it is
the write path that undermines it. **Fix:** serialise per household (advisory lock or a transactional
`SELECT … FOR UPDATE` on a per-household head row).

---

## Medium

| # | Finding | Evidence |
|---|---|---|
| M1 | **Login is unthrottled by default.** `RATE_LIMIT_ENABLED` is off unless set, and the per-user bucket can never fire because the global guard runs before `JwtAuthGuard`, so `request.user` is undefined. Only the IP bucket (60) ever applies. No `trustProxy` either, so behind a proxy every client shares one bucket. | `rate-limit.guard.ts:28,54,65`; `app.module.ts:39` — default verified |
| M2 | **Assessments have no uniqueness constraint.** `Assessment` has only `@@index([workspaceId])`; `importAssessment` always creates; `getLatestAssessment` picks by `createdAt desc`. Two imports → two rows, and the displayed assessment is arbitrary. My own e2e database holds **2** rows for one workspace from two imports. | `schema.prisma:590`; `filing.service.ts:1582-1586` |
| M3 | **`ownerId` is taken from the request body.** `confirmFact` / `updateFact` / `updateProfile` persist any UUID as the owner without checking membership of *this* household, so a figure can be misattributed to the spouse column, and a freelance profile joined on `owner` returns another tenant's e-mail. `uploadDocument` does this check correctly and can be copied. | `facts.service.ts:261,402`; `freelance.service.ts:142` |
| M4 | **A malformed household id is a 500.** Only the `workspaceId` branch of the guard validates the UUID; `GET /api/households/not-a-uuid` reaches Prisma and returns 500. Verified live (the workspace equivalent correctly returns 403). | `household.guard.ts:39-46` |
| M5 | **Future-dated years are accepted.** `lossCarryForward` filters only `taxYear − year ≤ 17`, and the schema allows years to 2100, so a 2030 loss offsets 2025 income. The same pattern makes `mortgageOccupancyYear`/`rentalCompletionYear` produce negative ages and the wrong deduction band. | `engine.ts:813-815`; `questionnaire.schema.ts:15,95` |
| M6 | **Two rounding rules coexist.** `round2` (106 call sites) uses `Math.round((v + ε) × 100)/100`; the cents helpers (49 sites) use `Math.round(v × 100)/100`. They disagree on exact halves (1.005 → 1.00 vs 1.01), so the same amount can round differently depending on the path — in a product that claims cent-exact determinism. | `deductions.ts:371` vs `money.ts:8-10` |
| M7 | **Stale data survives a failed load.** The dashboard keeps the previous tax year's workspace when the new fetch fails (every tab is `workspace &&`, so the panel is blank under a finished spinner), and the calculator keeps the previous year's refund. The questionnaire seeds a fully populated default object and saves it over real answers if the GET failed. | `dashboard/page.tsx:52-82`; `TaxCalculatorView.tsx:29-41`; `QuestionnaireView.tsx:20-30` |
| M8 | **One click silently drops a document from the return.** Visibility cycles `PRIVATE → SHARED → INCLUDED → SHARED` with no confirmation, and `PRIVATE_DRAFT` becomes unreachable. The scan modal's category chips are decorative: `selectedType` never leaves the component. | `DocumentsView.tsx:166-181`; `CameraScanModal.tsx:120-124` (type not sent) — verified |
| M9 | **The invitation redirect is generated but never read.** The invite page links to `/login?redirect=…`, and neither login nor register reads the parameter, so the spouse signs in and lands in their own workspace with the invitation unaccepted. | `invite/[token]/page.tsx:126`; no `useSearchParams` in `(auth)/*` — verified |
| M10 | **Uploads have no declared size limit.** The schema accepts any length; the real ceiling is Fastify's implicit 1 MiB JSON body, so a scanned PDF above ~750 KB fails with 413 and a synchronous `writeFileSync` blocks the event loop for the rest of the request. | `document.schema.ts:4-16`; `documents.service.ts:113` |
| M11 | **Tokens live in `localStorage`.** Any XSS becomes a full account takeover including the 7-day refresh token. No XSS sink exists today (no `dangerouslySetInnerHTML`, no API-derived `href`/`src`), so this is a design risk rather than an open hole. | `auth-context.tsx:45-46` |
| M12 | **CIS and CIP are both granted on a tie.** One shared `best` means equal salary and pension credits both survive, although the function's own note says the law forbids cumulating them. | `credits.ts:284-296` |

## Low / hygiene

- `JWT_REFRESH_SECRET` is declared in `.env.example` and **never read**; `ADMIN_EMAILS` is read by the
  admin guard but **absent** from `.env.example`.
- `GET …/filing-record` is the only read gated by `@Roles`; the other filing reads are open to any
  member. Pick one read policy.
- The guard's two 403 messages distinguish "workspace absent" from "workspace belongs to someone
  else" — a cheap existence oracle for guessed UUIDs.
- Logout revokes every session of the user with only an access token; no re-authentication.
- Access tokens stay valid for their full 15 minutes after logout (the strategy never consults
  `Session`).
- 42 `as any` and 36 `: any` across 179 files; `noImplicitAny` is disabled in the API tsconfig, and
  the API tsconfig is not part of any npm script.
- Dead DTO fields (`qualifyingDividends`, `spouseAge`) and hardcoded legal constants outside the rule
  package (CIS €936 floor, CO₂ €40,000 plateau, the €13,000 threshold) mean 2026/2028 cannot vary
  them.

---

## Checked and found sound

Worth stating, because a review that only lists defects misrepresents the codebase:

- **Tenant isolation.** `HouseholdGuard` resolves the household from the route, never from the body,
  validates the workspace UUID before querying, requires an `ACTIVE` membership, and throws rather
  than returning `true` when nothing resolves. No cross-tenant read was found in the handlers.
- **Platform admin.** `ADMIN_EMAILS` is re-parsed per request, trimmed, lower-cased, matched exactly,
  fails closed when unset, and the e-mail comes from the database row — not from the token claim.
- **Money.** Integer-cent helpers with explicit rounding, and every total that must not go negative
  is floored.
- **Auth primitives.** argon2id (m=64 MiB, t=3), 15-minute access tokens, opaque refresh tokens
  stored only as hashes, rotated on use.
- **Upload path.** `path.basename()` plus a hash prefix inside a per-workspace directory — no
  traversal.
- **Web XSS surface.** No `dangerouslySetInnerHTML`, no `document.write`, no API-derived `href`/`src`;
  storage holds nothing beyond the two tokens.
- **Audit chain design.** Canonical JSON with sorted keys, and verification that detects a modified,
  deleted or re-ordered event.
- **The guard's own regression suite.** `cross-household-isolation` (8 tests) genuinely attacks the
  API and passes.

---

## Could not reproduce

**`INDIVIDUAL_REALLOCATION` omitting speculative gains** (reported as Critical). With a two-earner
couple and a €50,000 gain, reallocation *did* tax the gain (liability rose by €21,202 when the gain
was present). In my fixture all three assessment modes returned identical figures, which suggests my
minimal fixture does not mark the spouse as assessed — so I neither confirm nor deny the claim. It
needs a test built from a realistic couple questionnaire; the engine already has a probe from the
LEG-8 work showing the three modes diverging, which my fixture did not reproduce.

---

## Suggested fix order

1. **C1, C2** — wrong tax numbers, reachable by ordinary input, silent.
2. **H1, H6** — a viewer can invalidate a return; a viewer blocks filing.
3. **C3, H3** — the secret fallback and the missing refresh/revocation.
4. **H2, H4, H8** — the login dead-end, the tripling demo button, the forking chain.
5. **H5, H7** — the form and the breakdown disagreeing with the total.
6. **M2, M3, M4** — constraints and input validation; cheap, and they prevent whole classes of bug.

The two engine bugs and H7 each deserve a regression test built from the failing input above; the
current suite passes on all three.
