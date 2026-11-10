import io

p = r"B:\B\tax-app\apps\api\prisma\schema.prisma"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

# --- User: verification + token version -------------------------------------
old = """  isEmailVerified  Boolean               @default(false)
  isActive         Boolean               @default(true)"""
new = """  isEmailVerified  Boolean               @default(false)
  /// SHA-256 of the one-time e-mail verification token. Cleared once verified.
  emailVerificationTokenHash String?
  emailVerificationExpiresAt DateTime?
  /// Bumped to invalidate every access token already issued to this account.
  tokenVersion     Int                   @default(0)
  isActive         Boolean               @default(true)"""
assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)

# --- Session: token family for reuse detection ------------------------------
old = """  refreshTokenHash String
  userAgent        String?
  ipAddress        String?"""
new = """  refreshTokenHash String
  /// Rotation family: a reused (already revoked) token revokes the whole family.
  familyId         String?
  userAgent        String?
  ipAddress        String?"""
assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)

# Index for the verification lookup and the family sweep.
old = """  @@index([userId])
  @@map("sessions")"""
new = """  @@index([userId])
  @@index([familyId])
  @@map("sessions")"""
assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("schema ok")
