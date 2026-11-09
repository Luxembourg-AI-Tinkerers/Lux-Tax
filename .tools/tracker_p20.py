import io
p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("""## Phase 19 — MOB-1: mobile flows used household ids where workspace ids were required""",
"""## Phase 20 — MOB-2: the questionnaire flow called a method that does not exist

**Defect.** `app/(tabs)/tasks.tsx` called `mobileApiClient.submitTaxProfile(householdId, 2025, {...})`.
No such method exists on `LuxTaxApiClient`, and the payload was an obsolete shape
(`taxResidence`, `hasChildren`, `dependantsCount`, `hasRentalIncome`, `hasInsuranceDeductions`) that
`QuestionnaireAnswersDto` no longer accepts. The "resolve questionnaire" action could never work.

| Piece | Change |
|---|---|
| Call | `mobileApiClient.saveQuestionnaire(workspaceId, body)` — the real, workspace-scoped `PUT /api/workspaces/:id/questionnaire` |
| Payload | rewritten to the current `QuestionnaireAnswersDto`: `maritalStatus`, `hasEmploymentIncome`, `hasPensionIncome`, `hasPrimaryResidenceMortgage`, `hasLifeInsuranceOrPensionPlan`, `hasDonations`, `childrenCount`, `hasFreelanceIncome` |
| Id | resolves `workspaceId` once via `resolveWorkspace(..., 2025, householdId)`; readiness stays household-scoped, the questionnaire uses the workspace id — the two ids never cross over |
| Errors | checks `res.error` and alerts instead of reporting success unconditionally; the spinner is cleared before returning |
| Guard | the action refuses with a message when no workspace exists, rather than silently doing nothing |

**Regression test — the important part.** Because the mobile app cannot be typechecked here
(no React Native dependencies), this class of bug is invisible to `tsc`. `apps/mobile/test/client-methods.spec.ts`
now scans every mobile source for `mobileApiClient.<method>(` and asserts the method exists on
`LuxTaxApiClient`, plus four targeted assertions: the scanner uploads with `workspaceId`,
`calculateTax`/`approveReturn` receive `workspace.id`, and the questionnaire goes through
`saveQuestionnaire`. It is a static check — no RN build, no emulator.

Running that scan over the whole mobile app confirmed **no other phantom calls remain** (16 methods
used, all present).

**Verification status:** 261 / 261 tests pass, `tsc` exit 0, 50 files syntax `ok`. The React Native
build is still **not run**, so rendering and navigation remain unverified.

## Phase 19 — MOB-1: mobile flows used household ids where workspace ids were required""")

rep("""| 2026-11-09 | Phase 19 — MOB-1 workspace ids | ✅ **257 / 257 pass, 0 fail** (7 new resolver tests) · `tsc` exit 0 · 4 mobile files syntax `ok` · **RN build not run** |""",
"""| 2026-11-09 | Phase 19 — MOB-1 workspace ids | ✅ **257 / 257 pass, 0 fail** (7 new resolver tests) · `tsc` exit 0 · 4 mobile files syntax `ok` · **RN build not run** |
| 2026-11-09 | Phase 20 — MOB-2 questionnaire call | ✅ **261 / 261 pass, 0 fail** (4 new static tests) · `tsc` exit 0 · 50 files syntax `ok` · **RN build not run** |""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
