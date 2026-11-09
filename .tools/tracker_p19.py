import io
p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("""## Phase 18 — API-8: rate limiting and TOTP MFA""",
"""## Phase 19 — MOB-1: mobile flows used household ids where workspace ids were required

**Defect.** Three mobile flows sent a *household* id to workspace-scoped endpoints:

| Flow | Was | Now |
|---|---|---|
| Upload (`DocumentCameraScanner`) | `uploadDocument(householdId, taxYear, body)` — wrong id **and** wrong arity | `uploadDocument(workspaceId, body)`, prop renamed to `workspaceId` |
| Calculation (`estimate.tsx`) | `calculateTax(householdId, 2025)` | `calculateTax(workspace.id)` |
| Approval (`estimate.tsx`) | `approveReturn(householdId, 2025)` | `approveReturn(workspace.id)` |

A household id in a workspace route resolves to the wrong resource or 404s, so the mobile
app could not upload, calculate or approve at all.

| Piece | Where | Behaviour |
|---|---|---|
| Resolver | `apps/mobile/src/lib/workspace.ts` | `resolveWorkspace(client, taxYear, householdId?)` → `{ ok, workspaceId }` or `{ ok:false, reason: NO_HOUSEHOLD / NO_WORKSPACE / ERROR }`; never throws, so a screen can render a message instead of crashing |
| Estimate screen | `app/(tabs)/estimate.tsx` | resolves once in `loadData`, guards every action on `workspace.id`, and now uses the current DTO field names (`balancePayableOrRefund`, `grossIncome`, `solidaritySurchargeAmount`, `finalTaxLiability`, `taxWithheldAtSource`, `provenance[].outputAmount`) — the screen still referenced pre-2025 names |
| Documents screen | `app/(tabs)/documents.tsx` | resolves the workspace once; removed the dead `householdId` state |
| Scanner | `src/components/DocumentCameraScanner.tsx` | prop renamed `householdId` → `workspaceId`, so the wrong id can no longer be passed |
| Tests | `apps/mobile/test/workspace.spec.ts` | 7 tests: first-household resolution, explicit household, `NO_HOUSEHOLD`, `NO_WORKSPACE`, thrown client error, resolved id ≠ household id, id guard |

**Verification status — read this before trusting it:** the resolver is covered by real unit
tests (7 passing), and all four touched mobile files are transpile-checked for syntax. **The
React Native build was not run** — `apps/mobile` has no installed `react-native`/`expo`
dependencies here, so screen rendering, navigation and the camera flow are **unverified**.
`apps/mobile/src/lib/workspace.ts` intentionally has no `@luxtax/api-client` import so it stays
dependency-free and testable.

**Also spotted, not fixed (outside MOB-1):** `app/(tabs)/tasks.tsx` calls
`mobileApiClient.submitTaxProfile(...)`, which does not exist on the client — that flow cannot
work and belongs to the remaining MOB items.

## Phase 18 — API-8: rate limiting and TOTP MFA""")

rep("""| 2026-11-09 | Phase 18 — API-8 rate limit + MFA | ✅ **250 / 250 pass, 0 fail** (22 new tests, incl. RFC 4226/6238 vectors) · `tsc` exit 0 · flags default off |""",
"""| 2026-11-09 | Phase 18 — API-8 rate limit + MFA | ✅ **250 / 250 pass, 0 fail** (22 new tests, incl. RFC 4226/6238 vectors) · `tsc` exit 0 · flags default off |
| 2026-11-09 | Phase 19 — MOB-1 workspace ids | ✅ **257 / 257 pass, 0 fail** (7 new resolver tests) · `tsc` exit 0 · 4 mobile files syntax `ok` · **RN build not run** |""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
