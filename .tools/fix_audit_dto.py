import io

p = r"B:\B\tax-app\apps\api\src\modules\audit\audit.service.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

# The no-household branch returned a helper that does not exist. Map inline, as
# the original method did.
old = """    if (!params.householdId) {
      const hash = buildHash(null);
      const event = await this.prisma.auditEvent.create({ data: data(null, hash) });
      return this.toDto(event);
    }"""

new = """    if (!params.householdId) {
      const hash = buildHash(null);
      const unchained = await this.prisma.auditEvent.create({ data: data(null, hash) });
      return {
        id: unchained.id,
        householdId: unchained.householdId || undefined,
        workspaceId: unchained.workspaceId || undefined,
        actorId: unchained.actorId,
        actorEmail: unchained.actorEmail || undefined,
        eventType: unchained.eventType as AuditEventType,
        entityType: unchained.entityType,
        entityId: unchained.entityId,
        description: unchained.description,
        previousValue: unchained.previousValue ?? undefined,
        newValue: unchained.newValue ?? undefined,
        ipAddress: unchained.ipAddress || undefined,
        userAgent: unchained.userAgent || undefined,
        createdAt: unchained.createdAt.toISOString(),
      };
    }"""

assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
