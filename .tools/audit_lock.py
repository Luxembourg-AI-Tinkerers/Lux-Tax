import io

p = r"B:\B\tax-app\apps\api\src\modules\audit\audit.service.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

start = s.index("  async log(params: CreateAuditLogParams): Promise<AuditEventDto> {")
end = s.index("    return {\n      id: event.id,", start)

new = '''  async log(params: CreateAuditLogParams): Promise<AuditEventDto> {
    // API-10: chain this event to the previous one for the same household, so a
    // deleted or rewritten row breaks verification.
    //
    // Read-tip → compute → insert used to run unguarded, so two events in the
    // same household at the same moment both chained from the same predecessor
    // and the chain forked — permanently, because the trigger forbids repair. The
    // insert now runs inside a transaction holding a per-household advisory lock,
    // which serialises writers on that chain and costs nothing across households.
    const id = crypto.randomUUID();
    const createdAt = new Date();

    const buildHash = (prevHash: string | null) =>
      hashAuditEvent(prevHash, {
        id,
        householdId: params.householdId ?? null,
        workspaceId: params.workspaceId ?? null,
        actorId: params.actorId,
        eventType: params.eventType,
        entityType: params.entityType,
        entityId: params.entityId,
        description: params.description,
        createdAt: createdAt.toISOString(),
        previousValue: params.previousValue ?? null,
        newValue: params.newValue ?? null,
      });

    const data = (prevHash: string | null, hash: string) => ({
      id,
      createdAt,
      prevHash,
      hash,
      householdId: params.householdId,
      workspaceId: params.workspaceId,
      actorId: params.actorId,
      actorEmail: params.actorEmail,
      eventType: params.eventType,
      entityType: params.entityType,
      entityId: params.entityId,
      previousValue: params.previousValue ? (params.previousValue as any) : undefined,
      newValue: params.newValue ? (params.newValue as any) : undefined,
      description: params.description,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });

    // Events outside a household (login, registration) carry no chain, so they
    // need no lock.
    if (!params.householdId) {
      const hash = buildHash(null);
      const event = await this.prisma.auditEvent.create({ data: data(null, hash) });
      return this.toDto(event);
    }

    const event = await this.prisma.$transaction(async (tx) => {
      // Advisory lock scoped to this household for the rest of the transaction.
      await tx.$queryRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        params.householdId,
      );

      const previous = await tx.auditEvent.findFirst({
        where: { householdId: params.householdId, hash: { not: null } },
        // Ties inside one millisecond are broken by id, so the tip is stable.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { hash: true },
      });

      const prevHash = previous?.hash ?? null;
      const hash = buildHash(prevHash);
      return tx.auditEvent.create({ data: data(prevHash, hash) });
    });

'''

s = s[:start] + new + s[end:]
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("audit log rewritten")
