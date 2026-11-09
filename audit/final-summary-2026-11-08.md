# Lux-Tax — gap-closure summary (2026-11-08)

**Objective:** read the markdown requirement/status docs, establish what is done, what is missing, implement the missing items, and verify.

**Result:** the P0 defects and the next nine P1/P2 gaps from the audit are implemented and independently reviewed. The remaining work is listed explicitly; nothing in this summary claims it.

## Implemented and verified

### P0 pass

1. **Solidarity surcharge 100× bug** — cents/euros mix fixed; final-liability tests pin Class 1 €60k → €11,111.85, Class 2 €100k → €15,306.35 and the 7 %/9 % thresholds.
2. **Admin authorization** — `ADMIN_EMAILS` allowlist that fails closed; household write roles enforced; invitations cannot mint a `PRIMARY_FILER`; freelance writes are filer-only.
3. **Private-draft enforcement** — user-aware fact reads; calculation/filing/freelance only use return-approved facts; upload forced to `PRIVATE_DRAFT` with a same-household owner; activity-feed redaction; ownership-guarded delete.

### P1/P2 pass

4. **LEG-2 Art. 122 / Art. 123bis child relief** — €922.50/child; per-child dégrèvement count; bonification phase-out and 6+ cap lift; non-refundable; contracts/API/questionnaire/calculator.
5. **LEG-3 CIM** — reachable for SINGLE/DIVORCED/WIDOWED; `cimApplied`/`cimRefund` split; refund in the balance; summary card fixed; class/child resolution unified.
6. **LEG-4/5 foreign income** — securities no longer double-counted; a separate credit slice; Art. 3ter foreign income explicitly `unsupported` + warned.
7. **LEG-6 three-year Class 2 window** — death/divorce event years; Class 2 without spouse; former/deceased spouse excluded; Art. 111bis contributors clamped.
8. **LEG-7 certificate 160 + Form 100F** — explicit 160 table (supported + unsupported warnings); official 100F case numbers, spouse columns, person names, foreign-income instruction, net freelance profit, computed-credit kind.
9. **LEG-8 scenario comparison** — Class 2 vs 2×Class 1 vs Art. 3ter reallocation, non-persisting, married-couple eligibility, calculator card.
10. **API-3 guard** — deny-by-default household resolution; body ids cannot override the route; malformed workspace 403; victim-workspace e2e cases.
11. **API-4 notification foundation** — Prisma `Notification`/`NotificationPreference` + migration (authored, not applied); 11 types/3 severities; six workspace-scoped endpoints; ACTIVE-member fan-out with muted types; hooks for material fact, approval/ready, filing package; API client and dashboard bell/dropdown with mark read/all and email/push/mute preferences. In-app only; email/push delivery is not implemented.
12. **API-5 approval invalidation + version history** — shared `ReturnApprovalsService.invalidateForChange` supersedes all active approvals, sets `NEEDS_REVIEW`, increments `activeReturnVersion` once and audits `APPROVAL_INVALIDATED`, with no-op when nothing is approved. Triggers: fact confirm/update/delete (redacted reasons preserved), questionnaire save, document visibility/delete, persisted recalculation, freelance demo facts; `compareScenarios` never invalidates. `GET /return-versions` returns newest-first history with DRAFT/APPROVED/SUPERSEDED status, synthetic current draft, final liability, package flag and superseded approval reasons; the filing view shows a version-history card and clears stale version/package state on null or year switch.

## Verification

| Check | Result |
|---|---|
| Engine + annex + platform-admin + fact-visibility + class-resolution + form100-case-map + notification-rules + return-version-history suites | **179 / 179 pass** (30 suites) |
| `tsc -p tsconfig.test.json` | exit 0 |
| `node .tools/syntax_check.cjs` | 43 / 43 files `ok`, exit 0 |
| Independent reviews | P0 round 2 allPass; LEG-2 round 2 allPass; LEG-3 round 2 allPass; LEG-4/5 allPass; LEG-6 round 5 allPass; LEG-7 round 2 allPass; LEG-8 round 2 allPass; API-3 round 2 allPass; API-4 allPass; API-5 round 2 allPass |

**Caveat:** API e2e, migrations and browser rendering cannot run here (`@nestjs/*`, the generated Prisma client, Postgres and React/Next dependencies are absent). API service/controller/guard and TSX files are covered by transpile checks, pure-helper tests and independent code review, not a live HTTP/browser run. `invalidateForChange`/`getHistory` have no service-level mock-Prisma test; approval invalidation and history mapping are code-reviewed, not executed. Legacy rows/packages are not backfilled.

## Still missing (not claimed)

- **LEG-2 residual** per-child history (two-bonification limit, résidence alternée, same child in both reliefs — warning only).
- **Foreign credit** is still one aggregate slice, not per holding or per country.
- **Form 100F line precision** remains category-level in places (1553 covered-DS total, Art. 14 vs 91, foreign split).
- **API-6** filing record, assessment follow-up/objection dates, frozen filed version; **API-7** package hash/evidence index/mapping version; **API-8** rate limiting/MFA/session hardening; **API-9** calculation history.
- **Notification delivery**: email/push channels, outbox/retry/dedupe, and emitters for invitations, document confirmation, missing documents, deadlines, approval invalidation, assessment follow-up and security alerts.
- **Approval freshness**: no 409 `RECALCULATION_REQUIRED` guard; history is count-based for required approvers and has no field-level diff/package hash.
- **Mobile MOB-1..11**: outside the workspace build; wrong workspace ids; no push/deep links/offline queue/biometric gate/package download.
- **Externally blocked:** 2026 CIC table and loi 8775 text; gated, return 0 and warn.
- **DB/e2e**: apply migrations, regenerate the Prisma client, run the API e2e suite; add service-level mock-Prisma tests for invalidation/history.

## Files of record

- `audit/audit-legal.md`, `audit/audit-api.md`, `audit/audit-product.md`, `audit/audit-mobile.md` — original audits.
- `audit/implementation-plan-2026-11-08.md` — selected scope and acceptance.
- `audit/impl-*.md` — implementation reports (P0, LEG-2…LEG-8, API-3, API-4, API-5).
- `audit/review-*.md` — independent reviews.
- `implementation-tracker.md`, `gap-check-2026-11-08.md`, `docs/luxembourg-resident-tax-optimisation-checklist-2025-2026.md` — updated status documents.
