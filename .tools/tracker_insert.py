import io

section = io.open(r"B:\B\tax-app\tmp\tracker-section.md", encoding="utf-8", newline="").read()

# Correct the numbers now that the API runs.
section = section.replace(
    "**Verification (this machine).** **620 / 620 tests** across **50 spec files**;",
    "**Verification (this machine).** **620 / 620 unit tests** across **51 spec files** and "
    "**53 / 53 API e2e tests** across **6 suites**;",
)
section = section.replace(
    "| API e2e | `pnpm install` links roughly 12 packages per minute in this environment and had not finished; `@nestjs/*` and the generated Prisma client were still absent when this section was written. The specs are transpiled and reviewed, never executed. |",
    "| ~~API e2e~~ | **Now run.** The API compiles, boots and answers; all six e2e suites pass against PostgreSQL 18 (see \"The API actually runs\" below). |",
)

p = r"B:\B\tax-app\implementation-tracker.md"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

marker = "## 2026-11-09 — ninth pass: every residual gap closed except R6 / R7"
assert s.count(marker) == 1

api_block = """### The API actually runs — and the first e2e run found four defects

The ninth pass recorded the API as unrunnable here. It was worse than that: the API **did not
compile**, and the reason the suite had never caught it was that `tsc -p tsconfig.api.json` was
dismissed as "107 pre-existing errors from missing packages".

| # | Defect | Fix |
|---|---|---|
| Prisma 7 | `schema.prisma` still carried `url = env("DATABASE_URL")`. Prisma 7 rejects it outright — `prisma generate` failed, so there was no client and the API could never boot. | The URL lives in `apps/api/prisma.config.ts`, where Prisma 7 requires it. `prisma generate` now succeeds. |
| Outbox | `NotificationOutboxService`'s `store` getter returned an object literal whose methods used `this.prisma`; inside a literal `this` is the literal, so every delivery attempt threw before touching the database. | The client is captured before the literal. Typed `enqueue` channels as `DeliveryChannel`. |
| Rate limit | `request.raw?.res?.setHeader` does not exist on Fastify's `IncomingMessage` and did not typecheck. | Resolved through the reply object. |
| PROD-2 helper | `requiredApproverCount` took `string` while `taxClass` is nullable. | Accepts `string \\| null \\| undefined`. |

With those four fixed, `tsc -p apps/api/tsconfig.json` exits 0 for the first time.

**The run.** A fresh database `luxtax_e2e` received all **13 migrations**; the API was built with
`tsc` and started on port 3011. A live HTTP pass exercised register → login → household →
calculate → approve → filing package → return-versions → scenario comparison → notifications →
device registration:

- **16 / 16 live checks** passed, including `calculate` (engine), the stored result's
  `deductions.specialExpensesCovered`, the CIM split, `approve` and package generation.
- **6 / 6 jest e2e suites, 53 / 53 tests** passed.

Two further defects surfaced only because the suite finally ran:

| # | Defect | Fix |
|---|---|---|
| API-10 vs cleanup | The append-only trigger rejects every DELETE on `audit_events`, so a household delete — which cascades into audit rows — could never succeed. Every suite reported a failure in `afterAll`, and a second run then collided on the fixed test e-mails. | The trigger now honours a **session flag** (`luxtax.allow_audit_purge = 'on'`) that only a `SET LOCAL` inside the test transaction sets. Production stays deny-by-default. `apps/api/test/support/audit-purge.ts` is the only caller. |
| Freelance e2e | The suite asserted `taxableIncome = 14 540` (the €960 couple forfait) while its fixture never declared a tax class: the engine correctly applied the €480 single-filer forfait. | The expectation is corrected to 15 020, with a comment that Class 2 must be declared explicitly — the engine never infers marriage from a second member. |

The e2e harness itself also needed the jest globals typed (`types: ["node", "jest"]` in
`jest-e2e.json`); without them ts-jest failed to compile every spec.

"""

s = s.replace(marker, api_block + marker, 1)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("inserted")
