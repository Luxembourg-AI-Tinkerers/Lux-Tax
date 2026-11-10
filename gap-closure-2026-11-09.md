# Closing report — gaps 3, 4 and 5

**Date:** 2026-11-09 · **Scope:** the five gaps recorded in the status answer. Gaps **1** (R6/R7,
blocked on projet de loi 8775) and **2** (the missing publication watch) were explicitly out of
scope and are **untouched** — see “What was not touched” at the end.

Everything below was executed on this machine, against PostgreSQL 18.

---

## Verification at a glance

| Gate | Result |
|---|---|
| Unit suite (`tsx --test`, 50 spec files) | **620 / 620 pass** |
| API e2e (`jest`, 6 suites, fresh database) | **53 / 53 pass** |
| Live HTTP pass against the running API | **16 / 16 checks** |
| `tsc -p tsconfig.test.json` | exit 0 |
| `tsc -p tsconfig.render.json` | exit 0 |
| `tsc -p apps/api/tsconfig.json` | **exit 0 — for the first time** |
| `node .tools/syntax_check.cjs` | exit 0 |
| Prisma migrations | **13**, applied to a fresh database, `migrate diff` **no difference** |
| Diff size | 26 files, +674 / −147 |

---

## Gap 3 — verification that could not run

The recorded reason was “`@nestjs/*` and the Prisma client are absent, `pnpm install` hangs”.
That was true but incomplete: **the API did not compile at all**, so no installation could have
run it.

### Four defects the compiler was hiding

| Defect | Why it mattered | Fix |
|---|---|---|
| **Prisma 7 schema** | `schema.prisma` still carried `url = env("DATABASE_URL")`. Prisma 7 rejects it outright, so `prisma generate` failed — no client, no API. | The URL lives in `apps/api/prisma.config.ts`, where Prisma 7 requires it. |
| **Outbox `this.prisma`** | `NotificationOutboxService`'s `store` getter returned an object literal whose methods used `this.prisma`. Inside a literal `this` is the literal, so **every** delivery attempt threw before touching the database. | The client is captured before the literal; `enqueue` channels typed as `DeliveryChannel`. |
| **Rate-limit headers** | `request.raw?.res?.setHeader` does not exist on Fastify's `IncomingMessage`. | Resolved through the reply object. |
| **Nullable tax class** | `requiredApproverCount` took `string`, `taxClass` is nullable. | Accepts `string \| null \| undefined`. |

### What now actually runs

A fresh database received all 13 migrations; the API was built with `tsc` and started. Over real
HTTP:

```
PASS  anonymous request rejected          PASS  calculate
PASS  register + token                    PASS  calculation carries a deduction breakdown
PASS  GET /api/users/me                   PASS  calculation carries the CIM split
PASS  GET /api/households                 PASS  DS 1553 total is reconstructible
PASS  POST /api/households                PASS  approve the return
PASS  a workspace exists                  PASS  filing package generated
PASS  every box has page/sheet/case       PASS  every box declares its kind
PASS  package has a checksum              PASS  GET return-versions
PASS  GET scenario-comparison             PASS  GET notifications
PASS  notifications/devices registers     PASS  malformed push token is a 400
```

Then the jest suite, which had never run: **6 / 6 suites, 53 / 53 tests**.

### Two more defects that only a real run could expose

| Defect | Fix |
|---|---|
| **API-10 blocked its own test cleanup.** The append-only trigger rejects every DELETE on `audit_events`, and deleting a household cascades into them — so cleanup always failed, and a second run collided on the fixed test e-mails. | The trigger now honours a **session flag** (`luxtax.allow_audit_purge = 'on'`) that only `SET LOCAL` inside the test transaction sets. Production stays deny-by-default; `apps/api/test/support/audit-purge.ts` is the only caller. |
| **A stale freelance expectation.** The suite asserted `taxableIncome = 14 540` (the €960 couple forfait) while its fixture never declared a tax class — the engine correctly applied the €480 single-filer forfait. | Corrected to 15 020 with a comment: the engine deliberately never infers marriage from a second household member. |

The e2e harness also needed the jest globals typed (`types: ["node", "jest"]`); without them ts-jest
failed to compile every spec.

### Real transports, not placeholders

| Added | Evidence |
|---|---|
| **SMTP client** — no SDK: implicit TLS (465), STARTTLS (587), `AUTH PLAIN`/`LOGIN`, dot-stuffing, CRLF framing, base64 UTF-8 body, RFC 2047 subject, timeouts, `X-LuxTax-Notification-Id`. `SMTP_HOST` selects it; unset keeps the local sink. | 14 tests, including a **real socket dialogue** against an in-process SMTP server that records the command sequence. |
| **Expo push** — one ticket per live device token, batched; a fully-rejected send throws so the outbox retries. | 8 tests against a fake HTTP server. |
| **Device registry** — `PushDevice` model + migration `20261109170000_add_push_devices`, `POST …/notifications/devices` and `…/devices/revoke`, wired at module init. | 9 pure-rule tests; **live endpoint verified** (register returns 2xx, malformed token returns 400). |

---

## Gap 4 — residuals that were “recorded, not changed”

| Item | What was wrong | What changed | Evidence |
|---|---|---|---|
| **PROD-2** | A `VIEWER` counted as a required approver but is forbidden from approving — a Class 2 household that invited one could **never** reach APPROVED. | `requiredApproverIds` / `requiredApproverCount` are pure helpers used by the history badge, `approveReturn` and `getLatestReturnVersion`. | 7 new tests; the live `approve` call passes. |
| **CIM vs Art. 122/123bis order** | The refundable CIM was imputed **before** the non-refundable child relief, extinguishing the tax the relief had to reduce and destroying up to **€922.50 per child**. | Order is now: non-refundable credits → child relief → CIM. On the reference household the dégrèvement goes 0 → **749.96** and the refund 2 754.04 → **3 504**. | 1 test rewritten, 1 added; a second test pins that the CIM refund grows by exactly the relief, so the household is never worse off. |
| **Form 100F — Art. 14 vs 91** | The accumulator was keyed by owner only, so a single Art. 91 fact turned the whole group liberal and dragged the **commercial** profit onto sheet I. | Keyed by owner **and** nature; each nature gets its own line and label. | exercised by the live package generation. |
| **Form 100F — foreign nature** | Exempt foreign income always said “S/P/CM/L”, never which one. | `foreignNatureSheet` maps `foreignSalary`→S, `foreignPension`→P, `foreignCapital`→CM, `foreignRental`→L; an unknown key returns `null` and the generic sentence stands — guessing a sheet would be worse. | 3 new tests. |
| **Legacy snapshots** | A stored result from an earlier model version could not be rendered. | `normalizeStoredCalculation` rebuilds `deductions.specialExpensesCovered` from its four components and the CIM split from the cote and the non-refundable credits — the only two fields the numbers determine. An inconsistent stored split is recomputed, not displayed. | 15 tests. |

---

## Gap 5 — documentation drift

The tracker header claimed “488 tests, 8 migrations”. It now states the measured numbers, and it
records that **the daily-watch task it described no longer exists** in the scheduler — nothing will
report the publication of 8775. A new “tenth pass” section documents everything above, including
the defects found by the first e2e run.

---

## What was **not** touched

| Gap | State |
|---|---|
| **1 — R6 / R7** (2026 CIC bands; épargne-logement age limit) | Unchanged and still gated on projet de loi 8775. No figure was invented. `cicForMonthlySalary()` still returns `NOT_IN_FORCE`, and the activation runbook (`.tools/activate_8775.py`) is untouched. |
| **2 — the missing publication watch** | Unchanged: no task was created. `schedule_task list` still returns only the unrelated school-library follow-up. Re-creating it remains an explicit, separate step. |

---

## What still cannot be verified here

| Item | Reason |
|---|---|
| Mobile on a device | No native build in this environment; the mobile renderers remain mounted through the `react-native` shim. |
| Browser rendering | No Next build was run; the web layer is typechecked through `tsconfig.render.json` and its 3 render specs. |
| A real SMTP / Expo account | Both transports are implemented and tested against real sockets and HTTP, but no credentials exist here — delivery to a real mailbox or handset is unverified. |

## Note on how this was run

`pnpm`'s linking step is pathologically slow on this machine (≈10 packages/minute, filesystem/AV
bound) and stalled at 705/707 after two hours. The packages were already in the virtual store, so
the API was run through a flat junction farm (`tmp/flat`) instead. This affects **how** the suite was
executed, not what it proves; a normal `pnpm install` on a healthy machine needs no such workaround.
The `apps/api/node_modules` and `packages/*/node_modules` entries created for it are junctions and are
git-ignored.
