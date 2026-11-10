import io

p = r"B:\B\tax-app\apps\api\test\support\audit-purge.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
t = raw.replace("\r\n", "\n").rstrip("\n")

addition = """

/**
 * Purge audit rows by the address they recorded.
 *
 * A rejected login for an address that never had an account has no actor, so it
 * cannot be matched by `actorId`; the address in `actorEmail` is the only key.
 */
export async function purgeAuditEventsByEmail(
  prisma: PrismaService,
  emails: string[],
): Promise<number> {
  if (emails.length === 0) return 0;

  await grantPurgeRole(prisma);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL luxtax.allow_audit_purge = 'on'");
    const result = await tx.auditEvent.deleteMany({
      where: { actorEmail: { in: emails } },
    });
    return result.count;
  });
}
"""

io.open(p, "w", encoding="utf-8", newline=nl).write(t + "\n" + addition)
print("helper added")
