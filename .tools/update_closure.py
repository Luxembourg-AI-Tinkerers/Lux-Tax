import io

p = r"B:\B\tax-app\review-closure-2026-11-10.md"
raw = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
t = raw.replace("\r\n", "\n")

# --- 1. M10 row -------------------------------------------------------------
old_m10 = "| M10 | No retention, erasure or export | **NOT CLOSED** | See \"Deliberately open\". |\n"
new_m10 = (
    "| M10 | No retention, erasure or export | **CLOSED** | `GET /api/users/me/export` (one JSON document), `DELETE /api/users/me` (anonymise + destroy credential + revoke sessions, 409 while another active member depends on the owner), `GET /api/users/me/sessions`. Retention: the model-read snippet is cleared once its facts are confirmed, expired sessions are pruned on issue. Policy and its limits: `docs/data-retention.md`. Guarded by `account-lifecycle.e2e-spec.ts`. |\n"
)
assert t.count(old_m10) == 1, "M10 row"
t = t.replace(old_m10, new_m10, 1)

# --- 2. L3 row --------------------------------------------------------------
old_l3 = "| L3 | Failed logins produce no audit event | Open (needs a new `AuditEventType` enum value + migration); mitigated by throttling |\n"
new_l3 = (
    "| L3 | Failed logins produce no audit event | **CLOSED** — `USER_LOGIN_FAILED` on wrong password, inactive account, failed second factor *and* an address matching no account (actor null). The attempted secret is never written. `recordLoginFailure` cannot turn a 401 into a 500. |\n"
)
assert t.count(old_l3) == 1, "L3 row"
t = t.replace(old_l3, new_l3, 1)

# --- 3. L6 row --------------------------------------------------------------
old_l6 = "| L6 | No proxy trust, so one bucket would cover everyone | Open — deployment topology, documented in `.env.example` |\n"
new_l6 = (
    "| L6 | No proxy trust, so one bucket would cover everyone | **CLOSED** — `TRUST_PROXY` (off by default) builds Fastify's `trustProxy` from a hop count or a network list; an unreadable value falls back to no trust. The controllers no longer read `x-forwarded-for` themselves, which was the spoofable part. `proxy-trust.spec.ts` + an e2e that sends a spoofed header. |\n"
)
assert t.count(old_l6) == 1, "L6 row"
t = t.replace(old_l6, new_l6, 1)

# --- 4. Replace the "deliberately open" section -----------------------------
start = t.find("Three items are recorded rather than patched, because patching them would mean inventing a product")
assert start != -1, "open section"
end = t.find("Two smaller caveats worth stating:")
assert end > start, "open section end"

new_section = """All three originally-recorded items are now closed. Two of them needed a decision as much as code,
so the decision is written down rather than implied:

1. **Retention, erasure and export (M10) — CLOSED.** The user-facing rights exist and are tested; the
   policy they implement is in `docs/data-retention.md`. The parts that are deliberately *not*
   automatic are named there: the household and its filed return are retained (the append-only audit
   trigger rejects the cascade a delete would need, and a tax record has its own retention), the
   identity is anonymised instead of deleted, and a shared household blocks erasure with a 409 until
   ownership is transferred — a transfer the product does not implement yet, which is why the guard
   exists.
2. **Failed-login audit event (L3) — CLOSED.** `USER_LOGIN_FAILED`, including for an address that
   matches no account: that is the case an enumeration run produces and the only one that previously
   left no trace. `actorId` became nullable for it, which is why the migration touches the audit table.
3. **Proxy trust (L6) — CLOSED.** `TRUST_PROXY` is off by default, supports a hop count or a network
   list, and fails closed on an unreadable value. The controllers no longer read
   `x-forwarded-for` themselves; that unconditional read was the actual spoofing vector, and an e2e
   sends a forged header to prove it is ignored.

"""
t = t[:start] + new_section + t[end:]

io.open(p, "w", encoding="utf-8", newline=nl).write(t)
print("closure report updated")
