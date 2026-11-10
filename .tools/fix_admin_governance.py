import io

p = r"B:\B\tax-app\apps\api\test\admin-governance.e2e-spec.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

old = """  afterAll(async () => {
    if (prisma && adminUserId) {
      // Audit rows are append-only (API-10): a trigger rejects DELETE, so no
      // cleanup is attempted here. Removing the user leaves them unlinked.

      await prisma.session.deleteMany({ where: { userId: adminUserId } });"""

new = """  afterAll(async () => {
    if (prisma && adminUserId) {
      // Audit rows are append-only (API-10). They also hold a foreign key to the
      // actor, so the user cannot be deleted until its own rows are purged —
      // inside the transaction that opts the trigger out.
      await purgeAuditEvents(prisma, [adminUserId]);

      await prisma.session.deleteMany({ where: { userId: adminUserId } });"""

assert s.count(old) == 1
s = s.replace(old, new)

old2 = """    if (prisma && ordinaryUserId) {
      // Audit rows are append-only (API-10): a trigger rejects DELETE, so no
      // cleanup is attempted here. Removing the user leaves them unlinked.

      await prisma.session.deleteMany({ where: { userId: ordinaryUserId } });"""

new2 = """    if (prisma && ordinaryUserId) {
      await purgeAuditEvents(prisma, [ordinaryUserId]);

      await prisma.session.deleteMany({ where: { userId: ordinaryUserId } });"""

assert s.count(old2) == 1
s = s.replace(old2, new2)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
