import io
p = "apps/api/src/modules/audit/audit.service.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:80])
    s = s.replace(old, new)

rep("""import { AuditEventType, AuditFilterDto, AuditEventDto } from '@luxtax/contracts';""",
"""import { AuditEventType, AuditFilterDto, AuditEventDto } from '@luxtax/contracts';
import * as crypto from 'node:crypto';
import { hashAuditEvent } from './audit-chain';""")

rep("""  async log(params: CreateAuditLogParams): Promise<AuditEventDto> {
    const event = await this.prisma.auditEvent.create({
      data: {
        householdId: params.householdId,""",
"""  async log(params: CreateAuditLogParams): Promise<AuditEventDto> {
    // API-10: chain this event to the previous one for the same household, so a
    // deleted or rewritten row breaks verification.
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
        householdId: params.householdId,""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
