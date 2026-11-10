import io

section = """## 2026-11-10 — review closure: 21 security + 19 code findings

Every finding from `security-review-2026-11-10.md` and `code-review-2026-11-10.md` is closed except
three recorded product decisions (retention/erasure, the failed-login audit event, proxy trust). The
detail is in `review-closure-2026-11-10.md`; this is the summary.

**Criticals, both re-exploited to prove they are gone.** An allowlisted address registered without
proof is now refused (`/api/admin/audit` → 403, was 200 with 105 rows across 12 households), and the
process refuses to boot without `JWT_ACCESS_SECRET` instead of signing with a literal.

**Highs.** The private-fact leak is closed in one predicate (snapshot, engine and package now agree);
rate limiting is on by default with a per-address credential bucket (401×5 then 429); e-mail
verification is real and gates both admin and invitation acceptance; helmet is registered (6/6
headers); `@Roles` covers the three viewer-writable routes; the activity feed is redacted for
non-filers; MFA is wired end to end (enrol/activate/disable, sealed seed, recovery codes, replay
guard); refresh tokens gained families with reuse detection and `tokenVersion` makes logout
immediate.

**Engine.** A pension withholding is no longer taxed as income; a standalone qualifying dividend is
no longer untaxed; the Art. 115 tranche reaches the base; CIS/CIP tie-break is strict; future-dated
years are refused with a warning; one rounding rule remains.

**Data.** Assessments are unique per (workspace, tax year); the audit chain takes a per-household
advisory lock so it cannot fork; `filing-record` no longer counts VIEWERs; the phantom
`matriculeEncrypted` column is gone.

**Verification.** 812 unit tests, 53 API e2e, three typechecks at 0, `next build` green, 17
migrations. The probe `tmp/verify-hardening.cjs` re-runs the security exploits on demand.

---

"""

p = r"B:\B\tax-app\implementation-tracker.md"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

marker = "## 2026-11-10 — full site e2e: the browser found what the API tests could not"
assert s.count(marker) == 1, s.count(marker)

s = s.replace(marker, section + marker, 1)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("tracker updated")
