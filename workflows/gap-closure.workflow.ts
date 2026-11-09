// Lux-Tax gap-closure workflow.
//
// Topology:
//   4 audit agents (legal/engine, product/web, API/data, mobile/baseline) -> report files
//   1 triage agent -> audit/implementation-plan-2026-11-08.md, at most 3 selected items
//   1 backend implementer (packages/*, apps/api/*) -> audit/backend-handoff.md
//   1 frontend implementer (apps/web/*, apps/mobile/*) -> audit/frontend-handoff.md
//   1 verifier (runs and fixes), 1 independent reviewer (read-only), 1 fixer if review fails
//   1 docs editor (updates tracker, gap check, checklist matrix)
// Final real checks are run by this script with world.run.

interface Finding {
  /** Stable id, e.g. LEG-1. */
  id: string;
  /** legal | product | api | mobile | docs */
  area: string;
  title: string;
  /** done | missing | partial | incorrect | doc-stale | blocked */
  status: string;
  /** P0 | P1 | P2 */
  priority: string;
  /** file:line or document section proving the claim. */
  evidence: string;
  /** Concrete change needed; empty when done or blocked. */
  proposal: string;
  /** How to prove completion. */
  acceptance: string;
}

interface AuditReport {
  /** One paragraph: what is actually done vs missing. */
  summary: string;
  /** At most 10 findings, strongest first. */
  findings: Finding[];
  /** Workspace-relative path of the full report the agent wrote. */
  reportPath: string;
  /** Commands run with exit codes, or "none". */
  checks: string;
}

interface WorkItem {
  id: string;
  title: string;
  /** P0 | P1 | P2 */
  priority: string;
  /** legal | product | api | mobile | docs */
  area: string;
  /** Why this matters, with doc/code evidence. */
  why: string;
  /** Backend, engine, contracts or API work; empty string when none. */
  backendScope: string;
  /** Web or mobile UI work; empty string when none. */
  frontendScope: string;
  /** Workspace-relative files expected to change. */
  files: string[];
  /** One observable check that proves it. */
  acceptance: string;
}

interface Triage {
  verifiedDone: string[];
  missing: WorkItem[];
  selected: WorkItem[];
  externalBlocked: string[];
  planPath: string;
  notes: string;
}

interface ImplResult {
  itemIds: string[];
  changedFiles: string[];
  whatWasDone: string;
  testsRun: string;
  handoffPath: string;
  blocked: string[];
}

interface FixResult {
  fixed: string[];
  changedFiles: string[];
  testsRun: string;
  notes: string;
}

interface VerifyResult {
  tests: string;
  typecheckTest: string;
  typecheckApi: string;
  syntax: string;
  fixes: string[];
  pass: boolean;
  notes: string;
}

interface ReviewItem {
  id: string;
  /** pass | fail | partial */
  verdict: string;
  evidence: string;
}

interface ReviewFinding {
  /** blocker | major | minor */
  severity: string;
  problem: string;
  evidence: string;
}

interface ReviewResult {
  allPass: boolean;
  items: ReviewItem[];
  findings: ReviewFinding[];
  summary: string;
}

interface DocsResult {
  filesChanged: string[];
  summary: string;
  remaining: string[];
}

interface FlowResult {
  auditReports: string[];
  selected: string[];
  backend: string;
  frontend: string;
  verification: string;
  review: string;
  docs: string;
  remaining: string[];
  finalChecks: string[];
}

const ROOT = "B:\\B\\tax-app";

phase("审计文档与代码现状");

const auditLegal = agent("audit-legal");
const auditProduct = agent("audit-product");
const auditApi = agent("audit-api");
const auditMobile = agent("audit-mobile");

const auditResults = await Promise.all([
  auditLegal
    .ask<AuditReport>(`You are auditing the Luxembourg personal tax app at ${ROOT}. Work read-only except for writing audit/audit-legal.md (create the audit folder if needed).

Goal: find legal and engine requirements that are still missing, partial or wrong in the code. The implementation tracker claims near-completion; verify its claims against code, do not repeat them.

Read these docs first, using the named sections:
- luxembourg-tax-resident-gap-analysis.md: section 4.1 P0-1..P0-11, section 4.2 P1-1..P1-10, section 4.3, section 8
- docs/luxembourg-resident-tax-optimisation-checklist-2025-2026.md: section 11 matrix and the sections it cites
- research/2025-2026-lu-tax-credits-and-classes.md: section 2.3 (moderation / bonification)
- docs/lir-118-121-bareme-2025-2026.md
- implementation-tracker.md and gap-check-2026-11-08.md (claims to test)

Then inspect:
- packages/tax-engine/src/engine.ts, credits.ts, deductions.ts, money.ts, scale.ts and rules/*.ts
- packages/contracts/src/tax.ts and packages/validation/src/questionnaire.schema.ts
- apps/api/src/modules/calculations/calculations.service.ts
- apps/web/src/components/TaxCalculatorView.tsx and QuestionnaireView.tsx

Verify each suspect with file:line:
1. Art. 122 degrevement / Art. 123bis bonification (922.50 EUR per child) - is it computed anywhere, or is childrenWithModeration only used as a cap multiplier?
2. Prime jeune salarie (75 percent, 5,000 EUR) - present? If it is outside the promised scope, say so explicitly.
3. Certificat 160 full code map - which codes are parsed, which are only text-matched?
4. Scenario comparison Class 2 vs 2x Class 1 and Art. 3ter - any engine or API support?
5. Individual assessment modes and foreign tax credit - warning, or a wrong number?
6. 2028 Class U transition - hook only; is that limitation documented and acceptable?
7. Any P0/P1 item from 4.1/4.2 with no code path.

Do NOT call CIC 2026 or loi 8775 missing code: they are externally blocked; list them as blocked facts. Do not report a gap you cannot point to with file:line or a missing symbol confirmed by grep.

Deliverable: write the full report to audit/audit-legal.md, then return:
- summary, at most 800 characters
- findings, at most 10, strongest first; id LEG-n; status missing|partial|incorrect|doc-stale|blocked; priority P0|P1|P2; evidence; proposal; acceptance
- reportPath (audit/audit-legal.md)
- checks: commands you ran, or "none"
Do not edit any other file.`)
    .catch(() => null),
  auditProduct
    .ask<AuditReport>(`You are auditing the product and web layer of the Luxembourg personal tax app at ${ROOT}. Work read-only except for writing audit/audit-product.md (create the audit folder if needed).

Goal: find product features promised in the plan that are absent, only stubbed, or unreachable in the web app.

Read:
- luxembourg-personal-tax-app-plan.md: sections 7.1-7.9, 8.1-8.12, 13.1-13.3, 22 phases 3-6
- README.md
Then inspect:
- apps/web/src/app/(workspace)/[householdId]/dashboard/page.tsx and every component under apps/web/src/components
- apps/web/src/lib/api.ts
- packages/contracts/src/*.ts and packages/api-client/src/client.ts

Check specifically, with file:line evidence:
1. Scenario comparison UI (Class 2 vs 2x Class 1, Art. 3ter) - plan section 7.6 and audit P2.
2. Notification center and user notification preferences - plan 7.9.
3. Household member management and permission UI - plan 6.
4. Document visibility states (private draft / shared / pending) and sharing UI - plan 6.3.
5. Return version history, approval invalidation after a material change, package hash, evidence index, field-transfer guide - plan 7.7 and 13.
6. Prior-year rollover and reconfirmation UI - plan 7.8 / phase 6.
7. Assessment follow-up and objection dates - plan 7.8.
8. Any "coming soon", TODO, dead button, or view that only renders static copy.

Distinguish three cases: backend exists but UI missing; UI exists but not wired to the API; nothing exists end to end. Do not report a feature as missing if it is out of the stated first-release scope.

Deliverable: write the full report to audit/audit-product.md, then return:
- summary, at most 800 characters
- findings, at most 10, strongest first; id PROD-n; status missing|partial|incorrect|doc-stale; priority P0|P1|P2; evidence; proposal; acceptance
- reportPath (audit/audit-product.md)
- checks: commands you ran, or "none"
Do not edit any other file.`)
    .catch(() => null),
  auditApi
    .ask<AuditReport>(`You are auditing the API, data model and security layer of the Luxembourg personal tax app at ${ROOT}. Work read-only except for writing audit/audit-api.md (create the audit folder if needed).

Goal: find backend capabilities promised in the plan that are absent, stubbed, or not enforced.

Read:
- luxembourg-personal-tax-app-plan.md: sections 6, 7.5-7.9, 13, 14.5, 15, 17, 20.2
Then inspect:
- apps/api/src/modules/**/*.ts
- apps/api/prisma/schema.prisma and apps/api/prisma/migrations/**
- apps/api/src/common/guards and filters
- apps/api/test/*.ts

Check specifically, with file:line evidence:
1. Notification persistence, delivery, user preferences - plan 7.9 / phase 1.
2. Scenario comparison endpoint or service - plan 7.6 / audit P2.
3. Document visibility and private-draft enforcement - plan 6.3.
4. Return version history, package hash, evidence index, field-transfer guide - plan 7.7 / 13.
5. Assessment follow-up and objection dates - plan 7.8.
6. Approval invalidation after a material fact change - plan 6.6.
7. Audit immutability and cross-household isolation - plan 17; check whether tests really cover it.
8. Rate limiting, MFA/passkeys, session hardening - plan 17.1; report only what is in scope for the first release.

Say whether a module is real, returns constants, or is missing. Do not infer a capability from a DTO name alone; follow it to the service and Prisma model.

Deliverable: write the full report to audit/audit-api.md, then return:
- summary, at most 800 characters
- findings, at most 10, strongest first; id API-n; status missing|partial|incorrect|doc-stale; priority P0|P1|P2; evidence; proposal; acceptance
- reportPath (audit/audit-api.md)
- checks: commands you ran, or "none"
Do not edit any other file.`)
    .catch(() => null),
  auditMobile
    .ask<AuditReport>(`You are auditing the mobile app and the delivery baseline of the Luxembourg personal tax app at ${ROOT}. Work read-only except for writing audit/audit-mobile.md (create the audit folder if needed).

Read:
- luxembourg-personal-tax-app-plan.md: sections 8.4-8.13, 20, 22 phase 1-5 mobile objectives
- implementation-tracker.md and gap-check-2026-11-08.md

Run these checks and record exact exit codes and counts:
1. node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts
2. node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json
3. node .tools/syntax_check.cjs

Then inspect apps/mobile/**/*.tsx and apps/mobile/src/**/*.ts for gaps against the plan:
- deep links and invitation handling
- push notification routing and preferences
- offline / interrupted upload queue
- biometric re-entry before approval
- filing package download and share controls
- questionnaire, tasks and household activity parity
- secure token storage and protected routes

Also audit documentation integrity:
- gap-check-2026-11-08.md section 5 says annex PDFs, rental amortisation and migration execution are not complete, while implementation-tracker.md phases 6-9 say they are closed. List every stale or contradictory claim with line references.
- Check the stated test counts (33, 43, 48) against the run above.

Deliverable: write the full report to audit/audit-mobile.md, then return:
- summary, at most 800 characters
- findings, at most 10, strongest first; id MOB-n or DOC-n; status missing|partial|incorrect|doc-stale; priority P0|P1|P2; evidence; proposal; acceptance
- reportPath (audit/audit-mobile.md)
- checks: exact commands, exit codes and counts
Do not edit any other file.`)
    .catch(() => null),
]);

const audits = auditResults.filter((r) => r !== null);
const reportPaths = audits.map((r) => r.reportPath);
log(`audit reports: ${reportPaths.length ? reportPaths.join(", ") : "none"}`);

if (audits.length === 0) {
  return {
    auditReports: [],
    selected: [],
    backend: "skipped: no audit report",
    frontend: "skipped: no audit report",
    verification: "not run",
    review: "not run",
    docs: "not run",
    remaining: ["all four audit agents failed"],
    finalChecks: [],
  } as FlowResult;
}

phase("汇总缺口并排定实施清单");

const triage = await agent("triage").ask<Triage>(`You are the triage lead for the Luxembourg personal tax app at ${ROOT}.

Read these audit reports (all are workspace files):
${reportPaths.map((p) => `- ${p}`).join("\n")}
Also read implementation-tracker.md, gap-check-2026-11-08.md and docs/luxembourg-resident-tax-optimisation-checklist-2025-2026.md section 11.

Tasks:
1. Merge duplicates. Keep only findings with concrete file:line evidence.
2. Separate into: verified done, genuinely missing/incorrect, externally blocked (CIC 2026 and loi 8775), out of scope.
3. Select at most 3 items for implementation in this run. Constraints:
- No fabricated legal amounts; unpublished measures stay gated.
- Implementable now in this repo; no new external service. A Prisma migration may be authored but not applied.
- Each selected item needs backendScope and/or frontendScope, a file list, and an acceptance check runnable with .tools (tests, tsc, syntax check).
- Prefer, in this order: (a) legal correctness, (b) promised product features such as scenario comparison and notification/task center, (c) wiring gaps that make an implemented rule unreachable.
- Do not select doc-only work; a docs editor handles that.
- If a finding is already done, mark it verified and skip it.
4. Write audit/implementation-plan-2026-11-08.md with these sections: verified done; missing/incorrect; externally blocked; out of scope; selected for this run (id, title, priority, backendScope, frontendScope, files, acceptance); execution order.

Be conservative: two strong items beat four half-done ones. The implementers will read only your plan file and their own handoff, so make each scope self-contained.

Return:
- verifiedDone: short strings
- missing: all WorkItems, including unselected ones (empty scope strings are allowed)
- selected: at most 3 WorkItems, each with real scopes
- externalBlocked: short strings
- planPath: audit/implementation-plan-2026-11-08.md
- notes: execution order and any dependency between items`);

log(`selected: ${triage.selected.map((i) => `${i.id} ${i.title}`).join(" | ") || "none"}`);

phase("实现缺失功能");

let backendResult: ImplResult | null = null;
let frontendResult: ImplResult | null = null;

const backendItems = triage.selected.filter((i) => i.backendScope.trim().length > 0);
if (backendItems.length > 0) {
  backendResult = await agent("impl-backend")
    .ask<ImplResult>(`You are the backend implementer for the Luxembourg personal tax app at ${ROOT}.

Read audit/implementation-plan-2026-11-08.md. Implement backendScope for every selected item, in the plan's execution order.

Boundary: you own packages/* and apps/api/*. You may edit packages/tax-engine, packages/contracts, packages/validation, packages/api-client, apps/api and the test files. Do NOT edit apps/web or apps/mobile. Do NOT edit docs (implementation-tracker.md, gap-check-2026-11-08.md, docs/*). Write only audit/backend-handoff.md.

Rules:
- Preserve existing behavior and all existing tests.
- Money uses integer cents (addMoney/sumMoney); rule amounts stay year-aware.
- No fabricated legal values. If a measure is unpublished, gate it with pendingMeasures and a warning, following the existing pattern.
- Add focused tests for each new behavior in packages/tax-engine/test or apps/api/test.
- For a Prisma change: edit schema.prisma and add a new apps/api/prisma/migrations/<timestamp>_<name>/migration.sql. Do not try to apply it unless a local cluster is already running; note it in the handoff.
- Add methods to packages/api-client/src/client.ts when you add an endpoint.
- Run at minimum:
  node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts
  node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json
  node .tools/node_modules/typescript/bin/tsc -p tsconfig.api.json (known Prisma-client errors are allowed; do not add new errors)
- If an item is impossible without an external text or service, stop that item, keep the rest, and record it in blocked.

Write audit/backend-handoff.md: per item, what changed, exact new/changed DTOs, endpoints and client methods, files, tests, and the frontend wiring needed.

Return itemIds, changedFiles, whatWasDone, testsRun, handoffPath (audit/backend-handoff.md), blocked.`)
    .catch(() => null);
}

const frontendItems = triage.selected.filter((i) => i.frontendScope.trim().length > 0);
if (frontendItems.length > 0) {
  frontendResult = await agent("impl-frontend")
    .ask<ImplResult>(`You are the frontend implementer for the Luxembourg personal tax app at ${ROOT}.

Read audit/implementation-plan-2026-11-08.md and audit/backend-handoff.md (if it exists). Implement frontendScope for every selected item in apps/web and apps/mobile.

Boundary: you own apps/web/*, apps/mobile/* and the file list in .tools/syntax_check.cjs. Do NOT edit packages/contracts, packages/validation, packages/tax-engine, packages/api-client or apps/api. If a needed type, endpoint or client method is missing, record it as blocked instead of duplicating it. Do NOT edit docs.

Rules:
- Keep the existing tab structure and visual language; add components instead of rewriting whole views.
- No placeholder buttons or dead controls: every control calls a real endpoint and shows success/error.
- Add every new or modified web/mobile file to the file list in .tools/syntax_check.cjs.
- Run node .tools/syntax_check.cjs and fix every failure.
- If the backend handoff names a new endpoint that does not exist, report blocked; do not invent it.

Write audit/frontend-handoff.md: files changed, wiring, blocked items.

Return itemIds, changedFiles, whatWasDone, testsRun, handoffPath (audit/frontend-handoff.md), blocked.`)
    .catch(() => null);
}

const backendSummary = backendResult
  ? `${backendResult.whatWasDone} (${backendResult.changedFiles.length} files)`
  : backendItems.length > 0
    ? "failed"
    : "no backend scope";
const frontendSummary = frontendResult
  ? `${frontendResult.whatWasDone} (${frontendResult.changedFiles.length} files)`
  : frontendItems.length > 0
    ? "failed"
    : "no frontend scope";
log(`backend: ${backendSummary}; frontend: ${frontendSummary}`);

phase("运行验证与修复");

const verifier = agent("verifier");
let verification: VerifyResult | null = null;

if (triage.selected.length > 0) {
  verification = await verifier.ask<VerifyResult>(`You are the verifier for the Luxembourg personal tax app at ${ROOT}. Read audit/implementation-plan-2026-11-08.md, audit/backend-handoff.md and audit/frontend-handoff.md. Run the real checks and fix failures in code (not docs).

Commands:
1. node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts
2. node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json
3. node .tools/node_modules/typescript/bin/tsc -p tsconfig.api.json (Prisma-client errors are expected; report any other error)
4. node .tools/syntax_check.cjs
Also run any new test file named in a handoff.

If a check fails, fix the smallest cause and re-run. Do not change legal behavior to make a test pass; if a test itself is wrong, fix the test and say so. Maximum 3 fix rounds.

Write audit/verification.md with exact commands, exit codes, counts and fixes.

Return tests, typecheckTest, typecheckApi, syntax (each as "exit N: detail"), fixes (list), pass (boolean), notes.`)
    .catch(() => null);
}

const verificationSummary = verification
  ? `${verification.pass ? "pass" : "fail"}; tests ${verification.tests}; typecheck ${verification.typecheckTest}`
  : "not run";
log(`verification: ${verificationSummary}`);

phase("独立复核");

let review: ReviewResult | null = null;

if (triage.selected.length > 0) {
  review = await agent("reviewer").ask<ReviewResult>(`You are the independent reviewer for the Luxembourg personal tax app at ${ROOT}. Work read-only: do NOT edit any file.

Read audit/implementation-plan-2026-11-08.md, audit/backend-handoff.md, audit/frontend-handoff.md, audit/verification.md, and the current git diff for the changed files.

For each selected item, verify its acceptance criterion yourself by reading the code and running targeted checks. Do not trust the implementers' or verifier's claims.

Check:
- The behavior is reachable from the product (UI to API to engine), not only unit-tested.
- No fabricated legal values; unpublished measures remain gated.
- New tests cover the new behavior and the existing suite still passes.
- No regression in unrelated files; no placeholder or dead UI.
- Doc changes are not part of this review; the docs editor runs after you.

Write audit/review.md with per-item verdicts and evidence.

Return allPass (boolean), items (id, verdict pass|fail|partial, evidence), findings (severity blocker|major|minor, problem, evidence), summary. If a failure is cosmetic, say so; if material, mark fail.`);

  if (!review.allPass) {
    const fix = await agent("fixer")
      .ask<FixResult>(`You are the fixer for the Luxembourg personal tax app at ${ROOT}. The independent reviewer found these material issues:

${JSON.stringify(review.findings)}

Fix only these issues in code. Preserve existing behavior; do not edit docs. Run the targeted tests and node .tools/syntax_check.cjs. Write audit/fixer-handoff.md with what changed.

Return fixed (list), changedFiles, testsRun, notes.`)
      .catch(() => null);

    if (fix) {
      verification = await verifier
        .ask<VerifyResult>(`Re-run the full verification after the fixes recorded in audit/fixer-handoff.md. Commands are the same four as before. Fix only build/test failures, not behavior. Update audit/verification.md with the new results. Return the same VerifyResult shape.`)
        .catch(() => verification);
    }

    review = await agent("reviewer")
      .ask<ReviewResult>(`Re-review the selected items after the fixes in audit/fixer-handoff.md and the re-run in audit/verification.md. Work read-only. Check only whether the previously reported findings are resolved and whether the acceptance criteria now pass. Return allPass, items, findings, summary.`)
      .catch(() => review);
  }
}

const reviewSummary = review
  ? `${review.allPass ? "pass" : "fail"}; ${review.items.map((i) => `${i.id}:${i.verdict}`).join(", ")}`
  : "not run";
log(`review: ${reviewSummary}`);

phase("运行最终检查");

const engineSpecs = await files.glob("packages/tax-engine/test/*.spec.ts");
const finalTestArgs = [
  ".tools/node_modules/tsx/dist/cli.mjs",
  "--tsconfig",
  "tsconfig.test.json",
  "--test",
  ...engineSpecs,
  "apps/api/test/annex-pdf.spec.ts",
];
const finalTests = await world.run("node", finalTestArgs, { timeoutMs: 300000 });
const finalTypecheck = await world.run("node", [".tools/node_modules/typescript/bin/tsc", "-p", "tsconfig.test.json"], {
  timeoutMs: 300000,
});
const finalSyntax = await world.run("node", [".tools/syntax_check.cjs"], { timeoutMs: 120000 });

const finalChecks = [
  `tests exit ${finalTests.exitCode}: ${finalTests.stdout.split("\n").filter((l) => l.includes("tests ") || l.includes("pass ") || l.includes("fail ")).slice(-3).join(" / ")}`,
  `typecheck exit ${finalTypecheck.exitCode}`,
  `syntax exit ${finalSyntax.exitCode}`,
];
log(finalChecks.join("; "));

phase("更新文档");

const docs = await agent("docs-editor")
  .ask<DocsResult>(`You are the documentation editor for the Luxembourg personal tax app at ${ROOT}. Update only the three documentation files named below; do not change code.

Read:
- implementation-tracker.md
- gap-check-2026-11-08.md
- docs/luxembourg-resident-tax-optimisation-checklist-2025-2026.md section 11
- audit/implementation-plan-2026-11-08.md
- audit/backend-handoff.md, audit/frontend-handoff.md, audit/verification.md, audit/review.md
- the final check results below

Final check results:
${finalChecks.join("\n")}

Reviewer summary:
${review ? review.summary : "not run"}

Tasks:
1. implementation-tracker.md: add a dated section "2026-11-08 - second gap-closure pass" listing exactly what this run implemented, the real test count, and any remaining items. Correct stale counts and claims in the header or verification log only where this run's evidence proves them wrong.
2. gap-check-2026-11-08.md: add a short addendum (or correct section 5) so it no longer says annex PDFs, rental amortisation, mixed-couple 3 d), 2028 transition or migration execution are unfinished when later tracker phases closed them. State what this run added and what remains.
3. docs/luxembourg-resident-tax-optimisation-checklist-2025-2026.md section 11: update only the rows affected by this run; do not rewrite the whole matrix. If a row is stale for a reason outside this run, mark it "stale - see tracker" rather than inventing a status.

Rules:
- Do not claim anything the verifier, reviewer or final checks did not confirm.
- Keep the documents in English and keep their existing structure.
- If the reviewer failed an item, record it as failed/open; do not launder it as done.

Return filesChanged, summary (at most 800 characters), remaining (short strings).`);

return {
  auditReports: reportPaths,
  selected: triage.selected.map((i) => `${i.id}: ${i.title}`),
  backend: backendSummary,
  frontend: frontendSummary,
  verification: verificationSummary,
  review: reviewSummary,
  docs: docs.summary,
  remaining: docs.remaining,
  finalChecks,
} as FlowResult;
