import io
p = "apps/api/src/modules/audit/audit.service.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:80])
    s = s.replace(old, new)

# import the chain helper
rep("""import * as crypto from 'crypto';""",
"""import * as crypto from 'crypto';
import { auditCategory, hashAuditEvent } from './audit-chain';""")

old_block = """  async log(params: CreateAuditLogParams): Promise<AuditEventDto> {
    const event = await this.prisma.auditEvent.create({
      data: {
        householdId: params.householdId,
        workspaceId: params.workspaceId,
        actorId: params.actorId,
        actorEmail: params.actorEmail,
        eventType: params.eventType,
        entityType: params.entityType,"""
new_block = """  async log(params: CreateAuditLogParams): Promise<AuditEventDto> {
    // API-10: chain this event to the previous one for the same household.
    const previous = params.householdId
      ? await this.prisma.auditEvent.findFirst({
          where: { householdId: params.householdId, hash: { not: null } },
          orderBy: { createdAt: 'desc' },
          select: { hash: true },
        })
      : null;

    const id = crypto.randomUUID();
    const createdAt = new Date();
    const prevHash = previous?.hash ?? null;
    const hash = hashAuditEvent(prevHash, {
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

    const event = await this.prisma.auditEvent.create({
      data: {
        id,
        createdAt,
        prevHash,
        hash,
        householdId: params.householdId,
        workspaceId: params.workspaceId,
        actorId: params.actorId,
        actorEmail: params.actorEmail,
        eventType: params.eventType,
        entityType: params.entityType,"""
rep(old_block, new_block)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
