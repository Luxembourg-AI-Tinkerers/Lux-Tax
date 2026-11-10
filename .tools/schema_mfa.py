import io

p = r"B:\B\tax-app\apps\api\prisma\schema.prisma"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

old = """  /// Bumped to invalidate every access token already issued to this account.
  tokenVersion     Int                   @default(0)"""
new = """  /// Bumped to invalidate every access token already issued to this account.
  tokenVersion     Int                   @default(0)
  /// TOTP seed, AES-256-GCM sealed. Present only once enrolment started.
  mfaSecret        String?
  mfaEnabled       Boolean               @default(false)
  /// SHA-256 of each single-use recovery code.
  mfaRecoveryCodes String[]              @default([])"""
assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("schema ok")
