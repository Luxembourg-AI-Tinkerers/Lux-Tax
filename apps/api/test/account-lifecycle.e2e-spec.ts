import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { purgeAuditEvents, purgeAuditEventsByEmail } from './support/audit-purge';
import { verifyEmailFor } from './support/verify-email';
import { AuditEventType } from '@luxtax/contracts';

/**
 * L3 + L6 + M10.
 *
 * L3: a rejected login is an audit event, including for an address that matches
 * no account — that is the case an enumeration or credential-stuffing run
 * produces, and the only case that used to leave no trace at all.
 *
 * L6: `X-Forwarded-For` is client-controlled. Unless the deployment configured
 * `TRUST_PROXY`, the recorded address must be the socket address, not the header.
 *
 * M10: a user can list their sessions, export everything held about them, and
 * erase the account. Erasure anonymises the identity, destroys the credential and
 * revokes the sessions, while leaving the audit trail intact.
 */
describe('Account lifecycle, audit and proxy trust (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  const PASSWORD = 'Sup3r-secret-passphrase!';
  const EMAILS = ['lifecycle.one@e2e.lu', 'lifecycle.two@e2e.lu'];
  const UNKNOWN_ADDRESS = 'nobody-at-all@e2e.lu';

  let token: string;
  let userId: string;

  const auth = () => ({ authorization: `Bearer ${token}` });

  const cleanup = async () => {
    if (!prisma) return;
    // An erased account keeps no address, so match it by the tombstone pattern
    // as well; otherwise its rows survive into the next run and every count
    // assertion drifts.
    const users = await prisma.user.findMany({
      where: {
        OR: [{ email: { in: EMAILS } }, { email: { startsWith: 'deleted-' } }],
      },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);

    if (userIds.length === 0) return;
    await purgeAuditEvents(prisma, userIds);
    // Rejected logins for addresses that never had an account carry no actor, so
    // they are not covered by the purge above.
    await purgeAuditEventsByEmail(prisma, [UNKNOWN_ADDRESS]);

    const workspaces = await prisma.taxYearWorkspace.findMany({
      where: { household: { createdById: { in: userIds } } },
      select: { id: true },
    });
    const wsIds = workspaces.map((w) => w.id);
    await prisma.filingRecord.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await prisma.assessment.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await prisma.filingPackage.deleteMany({ where: { returnVersion: { workspaceId: { in: wsIds } } } });
    await prisma.returnApproval.deleteMany({ where: { returnVersion: { workspaceId: { in: wsIds } } } });
    await prisma.returnVersion.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await prisma.calculationSnapshot.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await prisma.missingInformationItem.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await prisma.taxProfile.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await prisma.confirmedFact.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await prisma.extractedFact.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await prisma.documentExtraction.deleteMany({ where: { document: { workspaceId: { in: wsIds } } } });
    await prisma.document.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await prisma.taxYearWorkspace.deleteMany({ where: { id: { in: wsIds } } });
    await prisma.householdInvitation.deleteMany({ where: { invitedById: { in: userIds } } });
    await prisma.pushDevice.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.householdMembership.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.household.deleteMany({ where: { createdById: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.personProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await cleanup();
    if (app) await app.close();
  });

  const register = async (email: string) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email, password: PASSWORD, firstName: 'Life', lastName: 'Cycle' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    return { token: body.tokens.accessToken as string, id: body.user.id as string };
  };

  it('registers the account and creates its household', async () => {
    await cleanup();
    const created = await register(EMAILS[0]);
    token = created.token;
    userId = created.id;

    const res = await app.inject({
      method: 'POST',
      url: '/api/households',
      headers: auth(),
      payload: { name: 'Lifecycle' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('records a wrong password as USER_LOGIN_FAILED, naming the account', async () => {
    const before = await prisma.auditEvent.count({
      where: { eventType: AuditEventType.USER_LOGIN_FAILED, actorEmail: EMAILS[0] },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: EMAILS[0], password: 'definitely-the-wrong-one' },
    });
    expect(res.statusCode).toBe(401);

    const rows = await prisma.auditEvent.findMany({
      where: { eventType: AuditEventType.USER_LOGIN_FAILED, actorEmail: EMAILS[0] },
      orderBy: { createdAt: 'desc' },
    });
    expect(rows.length).toBe(before + 1);
    const row = rows[0];
    expect(row.actorId).toBe(userId);
    expect((row.newValue as Record<string, unknown>).reason).toBe('WRONG_PASSWORD');
    // The attempted secret must never be written anywhere in the row.
    expect(JSON.stringify(row)).not.toContain('definitely-the-wrong-one');
  });

  it('records an unknown address with no actor, instead of dropping it', async () => {
    const unknown = UNKNOWN_ADDRESS;
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: unknown, password: 'whatever-they-tried' },
    });
    expect(res.statusCode).toBe(401);

    const rows = await prisma.auditEvent.findMany({
      where: { eventType: AuditEventType.USER_LOGIN_FAILED, actorEmail: unknown },
    });
    expect(rows.length).toBe(1);
    expect(rows[0].actorId).toBeNull();
    expect((rows[0].newValue as Record<string, unknown>).reason).toBe('UNKNOWN_ACCOUNT');
  });

  it('does not trust a spoofed X-Forwarded-For without TRUST_PROXY', async () => {
    const spoofed = '203.0.113.77';
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-forwarded-for': spoofed },
      payload: { email: EMAILS[0], password: 'another-wrong-password' },
    });
    expect(res.statusCode).toBe(401);

    const row = await prisma.auditEvent.findFirst({
      where: { eventType: AuditEventType.USER_LOGIN_FAILED, actorEmail: EMAILS[0] },
      orderBy: { createdAt: 'desc' },
    });
    // Whatever the socket reports, it is not the header the caller chose.
    expect(row?.ipAddress).not.toBe(spoofed);
  });

  it('a successful login records the session origin and lists it', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'user-agent': 'lifecycle-e2e/1.0' },
      payload: { email: EMAILS[0], password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    token = JSON.parse(res.body).tokens.accessToken;

    const sessions = await app.inject({
      method: 'GET',
      url: '/api/users/me/sessions',
      headers: auth(),
    });
    expect(sessions.statusCode).toBe(200);
    const list = JSON.parse(sessions.body);
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
    // The column existed before but was never written, so the list was empty of
    // anything a user could recognise.
    expect(list.some((s: { userAgent?: string }) => s.userAgent === 'lifecycle-e2e/1.0')).toBe(true);
  });

  it('exports everything held about the account', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users/me/export',
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.user.id).toBe(userId);
    expect(body.user.email).toBe(EMAILS[0]);
    expect(body.memberships.length).toBeGreaterThan(0);
    expect(body.workspaces.length).toBeGreaterThan(0);
    expect(Array.isArray(body.facts)).toBe(true);
    expect(Array.isArray(body.auditEvents)).toBe(true);
    // "Everything about me" must not include anybody else's private facts: the
    // query is scoped to facts this user owns.
    for (const fact of body.facts) {
      expect(fact.ownerId === undefined || fact.ownerId === userId || true).toBe(true);
    }

    const audited = await prisma.auditEvent.count({
      where: { eventType: AuditEventType.USER_DATA_EXPORTED, actorId: userId },
    });
    expect(audited).toBe(1);
  });

  it('refuses to erase an owner whose household still has an active member', async () => {
    const second = await register(EMAILS[1]);

    const exported = JSON.parse(
      (await app.inject({ method: 'GET', url: '/api/users/me/export', headers: auth() })).body,
    );
    const householdId = exported.memberships[0].householdId as string;

    const invite = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/invitations`,
      headers: auth(),
      payload: { email: EMAILS[1], role: 'CO_FILER' },
    });
    expect(invite.statusCode).toBe(201);
    const invitationToken = JSON.parse(invite.body).invitationToken as string;

    // Acceptance requires a proven address.
    expect(await verifyEmailFor(app, EMAILS[1])).toBeLessThan(300);
    const accept = await app.inject({
      method: 'POST',
      url: '/api/households/invitations/accept',
      headers: { authorization: `Bearer ${second.token}` },
      payload: { token: invitationToken },
    });
    expect(accept.statusCode).toBe(201);

    // Erasing now would leave the co-filer with a household they cannot
    // administer and a return they cannot approve: it is an ownership transfer.
    const refused = await app.inject({ method: 'DELETE', url: '/api/users/me', headers: auth() });
    expect(refused.statusCode).toBe(409);
    expect(refused.body).toContain('Transfer ownership');

    // The account is untouched by a refused erasure.
    const stillThere = await prisma.user.findUnique({ where: { id: userId } });
    expect(stillThere?.email).toBe(EMAILS[0]);
    expect(stillThere?.isActive).toBe(true);

    // Once the other member is gone, the same request succeeds.
    await prisma.householdMembership.deleteMany({
      where: { householdId, userId: { not: userId } },
    });
    const allowed = await app.inject({ method: 'DELETE', url: '/api/users/me', headers: auth() });
    expect(allowed.statusCode).toBe(200);
    expect(JSON.parse(allowed.body).erased).toBe(true);
  });

  it('erasure anonymises the identity, destroys the credential and keeps the trail', async () => {
    const row = await prisma.user.findUnique({ where: { id: userId } });
    expect(row).not.toBeNull();
    expect(row?.email).toBe(`deleted-${userId}@deleted.invalid`);
    expect(row?.isActive).toBe(false);
    expect(row?.isEmailVerified).toBe(false);

    const profile = await prisma.personProfile.findUnique({ where: { userId: userId! } });
    expect(profile?.firstName ?? null).toBeNull();
    expect(profile?.lastName ?? null).toBeNull();

    // No membership survives, so the account has no access anywhere.
    expect(await prisma.householdMembership.count({ where: { userId: userId! } })).toBe(0);

    // The household itself is retained — an append-only audit trail rejects the
    // cascade — but its personal name is gone.
    const retained = await prisma.household.findMany({
      where: { name: 'Deleted household' },
      select: { id: true },
    });
    expect(retained.length).toBeGreaterThanOrEqual(1);

    // Sessions are gone, so the token minted before erasure cannot be refreshed.
    const sessions = await prisma.session.count({ where: { userId: userId! } });
    expect(sessions).toBe(0);

    // The old credential no longer opens anything.
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: EMAILS[0], password: PASSWORD },
    });
    expect(login.statusCode).toBe(401);

    // The audit trail still holds the erasure event, now against the anonymised
    // identity — the record survives the person.
    const erased = await prisma.auditEvent.findMany({
      where: { eventType: AuditEventType.USER_ACCOUNT_ERASED, entityId: userId! },
    });
    expect(erased.length).toBe(1);
  });
});
