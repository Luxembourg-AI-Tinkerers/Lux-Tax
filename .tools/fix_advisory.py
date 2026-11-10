import io

p = r"B:\B\tax-app\apps\api\src\modules\audit\audit.service.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

# pg_advisory_xact_lock returns void; a raw *query* cannot deserialize a void
# column, so run it as a statement instead.
old = """      await tx.$queryRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        params.householdId,
      );"""
new = """      await tx.$executeRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        params.householdId,
      );"""
assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
