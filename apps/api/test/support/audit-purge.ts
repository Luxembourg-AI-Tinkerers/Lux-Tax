import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Delete audit rows for a set of test actors.
 *
 * API-10 keeps `audit_events` append-only: a trigger rejects every DELETE. The
 * trigger honours a session flag (`luxtax.allow_audit_purge = 'on'`) so a test
 * database can be reset, and the flag is set inside this transaction only — a
 * production session never sets it, so the default remains deny.
 *
 * M4: the flag alone is no longer enough. Since
 * `20261110100000_audit_purge_role` the trigger also requires the session user
 * to be a member of the NOLOGIN role `luxtax_audit_purge`, because every role
 * can set a custom GUC. This helper therefore grants itself the role first
 * (idempotent; the role is kept NOLOGIN).
 *
 * Privilege the test database needs: either a migration/test connection that is
 * superuser or holds CREATEROLE — the usual docker entrypoint — or a one-time
 * `GRANT luxtax_audit_purge TO <application role>;` run by an administrator.
 * If neither holds, the grant below is a no-op and the delete fails with the
 * trigger's message, which names the role that is missing.
 *
 * `SET LOCAL` is used on purpose: it reverts with the transaction, so no later
 * statement in the same connection inherits the permission.
 */
export async function purgeAuditEvents(
  prisma: PrismaService,
  actorIds: string[],
): Promise<number> {
  if (actorIds.length === 0) return 0;

  await grantPurgeRole(prisma);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL luxtax.allow_audit_purge = 'on'");
    const result = await tx.auditEvent.deleteMany({
      where: { actorId: { in: actorIds } },
    });
    return result.count;
  });
}

/**
 * Best-effort `GRANT luxtax_audit_purge TO CURRENT_USER`. Re-granting is a no-op;
 * a role that may not grant simply leaves the membership as it is.
 */
async function grantPurgeRole(prisma: PrismaService): Promise<void> {
  try {
    await prisma.$executeRawUnsafe('GRANT luxtax_audit_purge TO CURRENT_USER');
  } catch {
    // No CREATEROLE/ADMIN OPTION: fall through and let the trigger explain itself.
  }
}


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
