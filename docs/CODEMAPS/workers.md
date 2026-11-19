# Workers codemap

**Last updated:** 2026-11-19
**Scope:** in-process background loops. There is no separate worker process, no Redis queue, and no external scheduler in the repository.

Both loops are disabled by default and enabled per deployment. They run inside the API process (`OnModuleInit`) and `unref()` their timers so they never keep the process alive on their own.

---

## 1. Notification outbox

**Files**
- `apps/api/src/modules/notifications/notification-outbox.ts` — pure pass (`runOutboxPass`) and `OutboxStore` contract
- `notification-outbox.service.ts` — Prisma store, timer, `dispatchDue()`, `stats()`
- `notification-delivery.ts` — retry policy, channel selection, stale-claim cutoff
- `adapters/email.adapter.ts`, `adapters/push.adapter.ts` and transports

### State machine

```
             enqueue                 claim                   send OK
(no row) ──────────────► PENDING ──────────────► SENDING ──────────────► SENT
                            ▲                        │
                            │ retry (attempts < 5)   │ send error
                            └────────────────────────┤
                                                     │ attempts >= 5
                                                     ▼
                                                  FAILED
                            no adapter / no transport / no device
                                                     ▼
                                                  SKIPPED
```

`PENDING → SENDING` is an atomic `updateMany` guarded by status (and by the stale cutoff for a `SENDING` row). Two API instances cannot both claim the same row.

### Retry policy

| Constant | Value | Meaning |
|---|---|---|
| `MAX_DELIVERY_ATTEMPTS` | 5 | Total attempts including the first |
| `BASE_BACKOFF_MS` | 60 000 | First retry waits 1 minute |
| `MAX_BACKOFF_MS` | 3 600 000 | Cap at 1 hour |
| Delay sequence | 1 min, 5 min, 25 min, 1 h, then FAILED | `60s × 5^(attempts-1)` |
| `STALE_CLAIM_MS` | 600 000 | A `SENDING` row older than 10 min is presumed orphaned and reclaimable |

The stale-claim recovery exists because a crash between claim and send would otherwise strand the delivery forever. It was added after the outbox review found the hole.

### Channel selection

`channelsForNotification(preference, type)`:

- `SECURITY_ALERT` → `['EMAIL', 'PUSH']`, ignoring preferences. A compromised session must not be able to silence the notice that reports it. The preferences API rejects muting this type too.
- Otherwise, the stored preference's `emailEnabled` / `pushEnabled`; a missing row means both channels on.
- An empty list means the notification stays in-app only.

### Enqueue

`NotificationsService.createForUser` / `emitToHousehold`:

1. Write the in-app `Notification` row first (with an optional `dedupeKey`).
2. Resolve preferences.
3. `NotificationOutboxService.enqueue` creates one `NotificationDelivery` row per channel with `skipDuplicates`, so a retry of the emission cannot duplicate deliveries.
4. A landed row remains `PENDING` until the poller dispatches it.

A `dedupeKey` is scoped per user (`@@unique([userId, dedupeKey])`). A concurrent duplicate emission loses the unique race and is treated as already sent.

### Where emissions originate

| Source | Notification type |
|---|---|
| Fact confirmed (material, shared, actor excluded) | `MATERIAL_FIELD_CHANGED` + `DOCUMENT_CONFIRMATION_REQUIRED` flows |
| Approval requested / return ready | `APPROVAL_REQUESTED`, `RETURN_READY_FOR_REVIEW` |
| Approval invalidated | `APPROVAL_INVALIDATED` |
| Filing package generated | `FILING_PACKAGE_GENERATED` |
| Household invitation | `HOUSEHOLD_INVITATION` |
| Security events | `SECURITY_ALERT` |
| Deadline sweep | `DEADLINE_REMINDER` |

Types without an emitter yet: `MISSING_DOCUMENT`, `ASSESSMENT_FOLLOW_UP` (assessment follow-up is stored, not emitted), `DOCUMENT_CONFIRMATION_REQUIRED` where no document hook fires. Treat the enum as a vocabulary, not a guarantee of delivery.

### Configuration

```env
NOTIFICATION_OUTBOX_ENABLED=false
NOTIFICATION_OUTBOX_INTERVAL_MS=60000   # clamped to >= 5000
```

### Operation

- `dispatchDue(limit = 25)` is public and idempotent; a real cron/queue consumer can call it.
- `stats()` returns `{ pending, sent, failed, skipped }`.
- A failing pass logs and returns zeroes; it never crashes the API.
- No adapter configured → `SKIPPED` with a reason, not a retry storm.
- Email: SMTP if `SMTP_HOST` is set, otherwise the JSONL sink (a real file transport).
- Push: Expo if `NOTIFICATION_PUSH_ENABLED=true`, with a sink fallback for tests.

### Tests

`notification-outbox.spec.ts` (claiming, retry, stale claim, skipped paths), `notification-delivery.spec.ts` (backoff, channel selection, window), `notification-devices-rules.spec.ts`, `smtp-transport.spec.ts`, `expo-push-transport.spec.ts`. The outbox tests use an in-memory `OutboxStore` double, so the pass executes rather than being described.

---

## 2. Deadline reminder sweep

**File:** `notifications/notification-reminders.service.ts`

### What it scans

Open assessments where:

```ts
isFinal: false
objectionDeadline: { not: null, gte: now, lte: now + 30 days }
```

Maximum 200 assessments per sweep.

### What it emits

One `DEADLINE_REMINDER` per assessment per day, to the household, with:

```ts
dedupeKey: `objection-deadline:${assessment.id}:${day}`
```

The per-day dedupe key makes a restart or a second replica unable to spam the household: the unique `(userId, dedupeKey)` index rejects the duplicate.

### Window helper

`isWithinReminderWindow(deadline, now, days = 30)` returns true only when the deadline is in the future and inside the window. A deadline that has passed is never reminded: the objection window is closed, and a late nudge would be misleading.

### Configuration

```env
NOTIFICATION_REMINDERS_ENABLED=false
NOTIFICATION_REMINDERS_INTERVAL_MS=21600000   # 6 h; clamped to >= 1 h
```

### Failure behaviour

A single assessment that fails to emit (for example, no eligible recipient) is logged and skipped; the sweep continues. The sweep returns `{ reminded }`.

### Test

`notification-rules.spec.ts` covers the window and dedupe-key policy.

---

## 3. What is *not* a worker

| Candidate | Reality |
|---|---|
| Rate limiter | Synchronous in-process token bucket inside `RateLimitGuard` |
| OCR | Runs inline in the upload request; not queued |
| Document extraction | Inline; a large PDF blocks that request, not the process |
| Calculation | Inline in `POST /calculate` |
| Audit purge | Manual SQL/role operation, not scheduled |
| Session cleanup | Opportunistic on the next session issue, not a timer |
| Rollover | Explicit request, not a cron |

If a future change makes extraction asynchronous, it should add a real queue table and a worker in this file's pattern: a pure pass + a Prisma store + a disabled-by-default timer.

---

## Related

- [Backend](backend.md)
- [Integrations](integrations.md)
- [Database](database.md)
- [API reference](../api.md)
