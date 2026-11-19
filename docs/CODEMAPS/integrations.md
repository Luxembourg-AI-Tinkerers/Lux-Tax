# Integrations codemap

**Last updated:** 2026-11-19
**Scope:** every external system the API talks to, and where the adapter lives.

The application is intentionally dependency-light. PostgreSQL is the only required external service. Everything else is optional and degrades to a documented local state.

---

## Integration inventory

| Integration | Required | Adapter / module | Failure behaviour |
|---|---|---|---|
| PostgreSQL | **Yes** | `PrismaService`, `@prisma/adapter-pg` | Process fails to start or requests 5xx; DB errors are never exposed |
| SMTP e-mail | No | `notifications/adapters/smtp-email.transport.ts` | Falls back to JSONL sink when `SMTP_HOST` unset; delivery retries in the outbox |
| Expo Push | No | `notifications/adapters/expo-push.transport.ts` | Delivery `SKIPPED` when no device; transport errors retry then `FAILED` |
| Vision model HTTP endpoints | No | `documents/extraction/vision-contract.ts` + admin registry | Falls through the model chain, then local OCR, then `NEEDS_OCR` |
| Tesseract OCR CLI | No | `documents/ocr/ocr-engine.ts` | `NOT_CONFIGURED` before spawn; `NEEDS_OCR` with a reason |
| Redis | **No** | — | `ioredis` is installed but unused; no connection is opened |

---

## PostgreSQL

**Configuration**

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/luxtax?schema=public"
```

`apps/api/prisma.config.ts` provides the URL to the Prisma 7 CLI. The schema's `datasource` block intentionally has no `url`; the pinned CLI rejects one.

**Pooling.** `PrismaService` creates a `pg.Pool` and a `PrismaPg` adapter. The pool is shared for the process lifetime; `onModuleDestroy` disconnects.

**Local setup**

```bash
pnpm --filter @luxtax/api prisma:generate
pnpm --filter @luxtax/api prisma:migrate     # 23 migrations
pnpm seed
```

**Operational checks**

```bash
npx prisma migrate diff --from-config-datasource \
  --to-schema apps/api/prisma/schema.prisma --exit-code   # must be 0
```

**Storage notes**
- Uploaded files are written to the upload directory, not to the database. `Document.storagePath` is resolved inside that directory before any read.
- `DocumentExtraction.extractedText` is nulled once every fact of the document is confirmed.
- `AuditEvent` is protected by a trigger; see [database](database.md).

---

## SMTP e-mail

**Files:** `notifications/adapters/email.adapter.ts`, `smtp-email.transport.ts`, `notification-delivery.ts`.

**Selected transport**

```
SMTP_HOST set   → SmtpEmailTransport (real protocol, node:net/node:tls)
SMTP_HOST unset → LocalSinkEmailTransport (append-only JSONL under tmp/notifications/email.jsonl)
```

The JSONL sink is a real transport, not a mock: it writes a complete RFC 5322 message and nothing leaves the machine.

**Configuration**

```env
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false       # true for implicit TLS (465)
SMTP_STARTTLS=true      # STARTTLS on a plaintext connection (587)
SMTP_REQUIRE_TLS=false  # refuse AUTH over plaintext
SMTP_USER=
SMTP_PASS=
SMTP_FROM=              # defaults to SMTP_USER
SMTP_TIMEOUT_MS=20000
NOTIFICATION_EMAIL_SINK= # override the JSONL path
```

**Implementation notes**
- No nodemailer: EHLO, STARTTLS, AUTH PLAIN/LOGIN, MAIL FROM, RCPT TO, DATA, QUIT are implemented directly.
- The body is base64 UTF-8, 76-character lines; non-ASCII subjects are RFC 2047 encoded.
- `X-LuxTax-Notification-Id` correlates the delivered message with the in-app row.
- Dot-stuffing follows RFC 5321 §4.5.2.
- The verification e-mail uses the same transport.
- **Verified against an in-process SMTP server**: `smtp-transport.spec.ts`. No production mailbox was available.

---

## Expo Push

**Files:** `notifications/adapters/push.adapter.ts`, `expo-push.transport.ts`, `notification-devices.service.ts`.

**Flow**

```
Mobile app → POST /api/workspaces/:id/notifications/devices { token, platform }
  → PushDevice row (unique token, revokedAt null)
Outbox → PushAdapter → ExpoPushTransport
  → resolveTokens(userId): non-revoked tokens
  → POST https://exp.host/--/api/v2/push/send
  → per-ticket result: accepted → SENT, all rejected → error → retry/FAILED
  → no tokens → SKIPPED (not a retry loop)
```

**Configuration**

```env
NOTIFICATION_PUSH_ENABLED=false   # optional local sink before module init
NOTIFICATION_PUSH_SINK=          # override the push JSONL path
EXPO_ACCESS_TOKEN=               # only if the Expo project requires one
EXPO_PUSH_ENDPOINT=              # override for a proxy or test server
```

**Notes**
- `NotificationDevicesService.onModuleInit()` installs `ExpoPushTransport`
  unconditionally, so push works as soon as a device registers; a deployment
  with no device yields `SKIPPED`, not a retry loop.
- `NOTIFICATION_PUSH_ENABLED=true` only installs the local sink at adapter
  construction; tests inject their own transport with `useTransport()`.
- Tokens are validated by the API (`^[A-Za-z0-9\[\]_-]{20,200}$`) and by `isExpoPushToken` in the transport.
- Re-registering a token is idempotent and reactivates a revoked token; a token
  registered to another account is moved to the caller.
- `ExpoPushTransport` takes an injectable `fetchImpl`; `expo-push-transport.spec.ts` drives a real HTTP server.
- No handset was available, so end-to-end delivery to a device is unverified.

---

## Vision model endpoints

**Files:** `documents/extraction/vision-contract.ts`, `receipt-ai-vision.service.ts`, `admin/admin.service.ts`, `admin/model-key-cipher.ts`, `admin/outbound-url-policy.ts`, `admin/data-class-policy.ts`.

**Registry**

- `CustomAiModel`: id, provider type, model identifier, endpoint URL, encrypted API key, capabilities (`VISION` / `TEXT`), permitted data class, hosting region, health/latency.
- `CustomAiRoute`: task name, primary model, fallback ids, prompt/schema versions, timeout, `maxDataClass`, rollout percentage.

**Call contract**

1. `resolveVisionChain` orders primary → fallbacks.
2. Skips disabled, text-only, endpoint-less models.
3. Enforces the route's `maxDataClass` at call time (not only at registration).
4. Sends the pinned prompt from `buildVisionPrompt` (24 field names + JSON shape).
5. `parseVisionExtraction` rejects prose, normalises amounts (`1.234,56` / `1,234.56`), keeps the best duplicate answer, drops unknown fields with a report, and refuses an answer with neither type nor figure.
6. Each model has a 20 s timeout; failure logs the model and falls to the next.

**Security**

- API keys encrypted at rest with AES-256-GCM (`MODEL_KEY_ENCRYPTION_KEY`, 32-byte hex). Keys are never returned in plaintext.
- `outbound-url-policy.ts` blocks:
  - non-https endpoints (except an explicit localhost in development),
  - loopback, link-local, private (RFC 1918), CGNAT, multicast, reserved ranges,
  - IPv6 loopback/link-local/unique-local and IPv4-mapped equivalents,
  - cloud metadata hostnames (`metadata.google.internal`, `instance-data`, …).
- DNS is resolved before the call; the policy is static-destination protection, not a DNS-rebinding defence (documented in the source).

**Data classes.** `PUBLIC` < `SYNTHETIC` < `REDACTED_CUSTOMER` < `CUSTOMER_DOCUMENT` (unredacted scans). A route may only call a model cleared for the data it would send; an unknown class on either side permits nothing (fail closed). The admin console exposes the class per model and route.

---

## Tesseract OCR

**Files:** `documents/ocr/ocr-engine.ts`, `documents/text/pdf-images.ts`, `documents/text/document-text.ts`.

**Configuration**

```env
OCR_TESSERACT_PATH=C:\Program Files\Tesseract-OCR\tesseract.exe
OCR_LANGUAGES=fra
OCR_PSM=6
```

**Behaviour**

- `OcrEngine.recognize(image, mimeType)` returns `TEXT | EMPTY | NOT_CONFIGURED | FAILED`.
- `TesseractCliOcrEngine` runs `tesseract <input> <outputbase> -l <langs> --psm <psm>` in a temporary directory, reads the `.txt`, and removes the directory.
- A missing variable or a path that does not exist returns `NOT_CONFIGURED` **before spawning**.
- The child process is injectable (`runner`) so arguments and failure paths are unit-tested without a binary.
- Scanned PDFs are converted to page images first: `/DCTDecode` JPEG passthrough, `/FlateDecode` → minimal PNG. Predictors, JPEG 2000, CCITT, CMYK, and 1-bit images are skipped rather than sent as garbage.
- Page cap 10; pixel cap 60 M.

**Measured** with Tesseract 5.4.0 (`fra` from `tessdata_fast`): a PNG receipt yields `grossSalary 76800.00`, `socialSecurity 9000.00`, `mortgageInterest 3500.00`; the scanned PDF yields the same three figures. Tesseract read line `105.` as `195.`, so the withholding figure did not arrive — the test asserts what the engine genuinely produced and relies on the confirmation step.

See [document automation](../document-automation.md) for the full measurements.

---

## Notification outbox (delivery side)

The outbox is an integration boundary: adapters implement `DeliveryAdapter`, the worker owns retry and state.

```
Notification (in-app, written first)
  → NotificationDelivery rows (EMAIL / PUSH, PENDING)
  → NotificationOutboxService.dispatchDue()
      → claim PENDING/SENDING-stale row
      → adapter.send()
      → SENT, or FAILED with attempts++ and exponential backoff
```

The worker is documented in [workers](workers.md).

---

## What is deliberately not integrated

| Integration | Why not |
|---|---|
| Cloud OCR (Google Vision, AWS Textract) | The contract supports any HTTP vision model; no vendor SDK or hard dependency is shipped |
| Payment / billing | Out of scope for a tax filing workspace |
| ACD / MyGuichet API | Filing is a generated package + a manual record; no government API is assumed |
| Redis / queue service | The outbox is PostgreSQL-backed; Redis is unused |
| Object storage (S3, etc.) | Uploads are local files with a path-traversal guard; storage is a deployment concern |

---

## Related

- [Architecture](ARCHITECTURE.md)
- [Modules](MODULES.md)
- [Files](FILES.md)
- [Backend](backend.md)
- [Workers](workers.md)
- [Database](database.md)
- [Document automation](../document-automation.md)
- [Dependency security](../dependency-security.md)
