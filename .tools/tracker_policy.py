import io

SECTION = """## 2026-11-10 — the three policy items, closed

The review-closure pass recorded three findings as deliberately open. All three are now closed, with
the decision written next to the code.

### L3 — a rejected login is an audit event

`USER_LOGIN_FAILED` (new enum value + migration `20261110160000_login_failed_audit`) is emitted on
every refusal: wrong password, inactive account, failed second factor, **and an address that matches
no account**. The last one matters most — it is what an enumeration or credential-stuffing run
produces, and it was the only case that used to leave no trace at all.

`audit_events.actorId` became nullable for it. That is the honest model: with no account there is no
actor, and dropping those rows would delete the signal. Existing rows keep their actor and their
hashes — the canonical payload hashes the id when present and `null` when absent, so the chain
verifies unchanged.

The emitter never records the submitted secret (asserted by an e2e that greps the whole row for it)
and never turns a refusal into a 500: an audit failure is logged and the caller still gets its 401.

### L6 — proxy trust is configuration, and the default is "do not trust"

`X-Forwarded-For` is client-controlled. The auth controller used to read it directly
(`req.ip || req.headers['x-forwarded-for']`), which let any caller write an arbitrary address into the
audit trail and reset the per-IP rate-limit bucket at will. That read is gone.

`TRUST_PROXY` now builds Fastify's `trustProxy` (`apps/api/src/config/proxy-trust.ts`):

| Value | Meaning |
|---|---|
| unset / `false` | the socket address is the client address; the header is never consulted |
| `1` … `n` | trust the last *n* hops (compiled to Fastify's hop predicate) |
| `10.0.0.0/8,...` | trust the header only when the peer is in a listed network |
| `true` | trust unconditionally — only correct when nothing but the proxy can reach the API |

An unreadable value falls back to **no trust**: a typo in a deployment variable must not silently
enable the header. `proxy-trust.spec.ts` (6 tests) pins that, including the case where a bare word
was being accepted as a network list — the test caught it and the parser now validates every entry.

### M10 — retention, erasure and export

| Right | Endpoint |
|---|---|
| See where I am signed in | `GET /api/users/me/sessions` |
| Get a copy of my data | `GET /api/users/me/export` |
| Erase my account | `DELETE /api/users/me` |

`Session.ipAddress`/`userAgent` were declared but never written, so the list would have been empty of
anything a user could recognise; they are now recorded at issue. Export returns one JSON document
(profile, memberships, workspaces, the facts the user owns, their document metadata, filing records,
their own audit events, sessions) and is itself audited.

Erasure anonymises the identity in place — address replaced by `deleted-<uuid>@deleted.invalid`,
password hash destroyed, verification and MFA state cleared, `tokenVersion` bumped, profile names
blanked — deletes sessions, push registrations and memberships, and renames a sole household to
"Deleted household".

**What it deliberately does not do:** delete the household, its workspaces or the audit trail. The
append-only trigger rejects the `UPDATE` a cascade would need, so a household with any audit history
cannot be deleted at all — a constraint the database enforces, not a preference. A filed return is
also a tax record with its own retention. And a shared household blocks erasure with **409** while
another active member depends on the owner: erasing them would leave a co-filer unable to administer
or file.

Retention of derived data: the raw text a model read from a document (`DocumentExtraction.extractedText`
and `rawJson`) is cleared as soon as every fact of that document is confirmed, and expired sessions are
deleted as the next one is issued. Policy, including the parts that remain manual, is in
`docs/data-retention.md`.

Implementation note: `document_extractions.extractedText` had to become nullable
(`20261110161000_retention_and_lifecycle`), which also carries the two lifecycle events.

**Verification.** `account-lifecycle.e2e-spec.ts` — 8 e2e tests (failed login ×3 paths, spoofed
header ignored, session list, export, erasure refusal, erasure effects). `proxy-trust.spec.ts` — 6
unit tests. The receipt-scanning e2e now asserts the snippet is cleared after confirmation.
**826 unit / 159 suites / 81 files; 67 API e2e / 8 suites; three typechecks at 0.**

---

"""

p = r"B:\B\tax-app\implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
t = raw.replace("\r\n", "\n")

marker = "## 2026-11-10 — PROD-2: closed in code, and now enforced by the build"
assert t.count(marker) == 1
t = t.replace(marker, SECTION + marker, 1)

# Header summary counts.
t = t.replace(
    "**816 unit tests across 79 spec files, 59 API e2e\ntests across 7 suites, 17 migrations",
    "**826 unit tests across 81 spec files, 67 API e2e\ntests across 8 suites, 19 migrations",
    1,
)
t = t.replace(
    "**Verification.** 820 unit tests, 59 API e2e (7 suites), three typechecks at 0",
    "**Verification.** 826 unit tests, 67 API e2e (8 suites), three typechecks at 0",
    1,
)

io.open(p, "w", encoding="utf-8", newline=nl).write(t)
print("tracker updated")
