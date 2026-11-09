import io

# 1) schema: chain columns
p = "apps/api/prisma/schema.prisma"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
old = """  userAgent     String?
  createdAt     DateTime        @default(now())"""
new = """  userAgent     String?
  /// API-10: hash chain. `prevHash` is the previous event's `hash` for the same
  /// household; `hash` covers this event's canonical form plus `prevHash`.
  prevHash      String?
  hash          String?
  createdAt     DateTime        @default(now())"""
assert s.count(old) == 1
s = s.replace(old, new)
s = s.replace("""  @@index([householdId, createdAt])""",
"""  @@index([householdId, createdAt])
  @@index([householdId, hash])""")
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("schema ok")
