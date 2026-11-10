import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { purgeAuditEvents } from './support/audit-purge';
import { verifyEmailFor } from './support/verify-email';
import { HouseholdRole, MembershipStatus, WorkspaceStatus, AuditEventType } from '@luxtax/contracts';

describe('Household Collaboration (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

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
    if (prisma) {
      const testEmails = ['alice.e2e@example.lu', 'bob.e2e@example.lu'];
      const users = await prisma.user.findMany({
        where: { email: { in: testEmails } },
        select: { id: true },
      });
      const userIds = users.map((u) => u.id);
      // Audit rows are append-only; purge the test actors' rows inside
      // an opted-in transaction so the rest of the cleanup can run.
      await purgeAuditEvents(prisma, userIds);

      if (userIds.length > 0) {
        // Audit rows are append-only (API-10): a trigger rejects DELETE, so no
        // cleanup is attempted here. Removing the user leaves them unlinked.

        await prisma.taxYearWorkspace.deleteMany({
          where: { household: { createdById: { in: userIds } } },
        });
        await prisma.householdInvitation.deleteMany({
          where: { household: { createdById: { in: userIds } } },
        });
        await prisma.householdMembership.deleteMany({
          where: { userId: { in: userIds } },
        });
        await prisma.household.deleteMany({
          where: { createdById: { in: userIds } },
        });
        await prisma.session.deleteMany({
          where: { userId: { in: userIds } },
        });
        await prisma.personProfile.deleteMany({
          where: { userId: { in: userIds } },
        });
        await prisma.user.deleteMany({
          where: { id: { in: userIds } },
        });
      }
    }
    if (app) {
      await app.close();
    }
  });

  let aliceToken: string;
  let aliceId: string;
  let bobToken: string;
  let bobId: string;
  let householdId: string;
  let invitationToken: string;

  it('Step 1: Alice registers as a taxpayer', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'alice.e2e@example.lu',
        password: 'Password123!',
        firstName: 'Alice',
        lastName: 'Dupont',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.user.email).toBe('alice.e2e@example.lu');
    expect(body.tokens.accessToken).toBeDefined();

    aliceToken = body.tokens.accessToken;
    aliceId = body.user.id;
  });

  it('Step 2: Alice creates "The Dupont Household"', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/households',
      headers: {
        authorization: `Bearer ${aliceToken}`,
      },
      payload: {
        name: 'The Dupont Household',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('The Dupont Household');
    expect(body.createdById).toBe(aliceId);
    expect(body.members.length).toBe(1);
    expect(body.members[0].role).toBe(HouseholdRole.PRIMARY_FILER);
    expect(body.members[0].status).toBe(MembershipStatus.ACTIVE);

    householdId = body.id;
  });

  it('Step 3: Verify initial 2025 tax workspace is active', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/households/${householdId}/workspaces/2025`,
      headers: {
        authorization: `Bearer ${aliceToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.taxYear).toBe(2025);
    expect(body.status).toBe(WorkspaceStatus.DRAFT);
  });

  it('Step 4: Alice invites Bob as Co-Filer', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/invitations`,
      headers: {
        authorization: `Bearer ${aliceToken}`,
      },
      payload: {
        email: 'bob.e2e@example.lu',
        role: HouseholdRole.CO_FILER,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.invitationToken).toBeDefined();
    expect(body.invitation.invitedEmail).toBe('bob.e2e@example.lu');
    expect(body.invitation.invitedRole).toBe(HouseholdRole.CO_FILER);

    invitationToken = body.invitationToken;
  });

  it('Step 5: Inspect invitation details using token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/households/invitations/${invitationToken}/details`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.householdName).toBe('The Dupont Household');
    expect(body.invitedEmail).toBe('bob.e2e@example.lu');
    expect(body.invitedRole).toBe(HouseholdRole.CO_FILER);
    expect(body.isValid).toBe(true);
  });

  it('Step 6: Bob registers with his own separate account', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'bob.e2e@example.lu',
        password: 'Password123!',
        firstName: 'Bob',
        lastName: 'Dupont',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    bobToken = body.tokens.accessToken;
    bobId = body.user.id;
  });

  it('Step 7: Bob accepts the invitation to join the household', async () => {
    // Acceptance requires proof of the invited address.
    await verifyEmailFor(app, 'bob.e2e@example.lu');
    const res = await app.inject({
      method: 'POST',
      url: '/api/households/invitations/accept',
      headers: {
        authorization: `Bearer ${bobToken}`,
      },
      payload: {
        token: invitationToken,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(householdId);
    expect(body.members.length).toBe(2);

    const bobMember = body.members.find((m: any) => m.userId === bobId);
    expect(bobMember).toBeDefined();
    expect(bobMember.role).toBe(HouseholdRole.CO_FILER);
    expect(bobMember.status).toBe(MembershipStatus.ACTIVE);
  });

  it('Step 8: Bob can now view the joint household and 2025 workspace', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/households/${householdId}/workspaces/2025`,
      headers: {
        authorization: `Bearer ${bobToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.taxYear).toBe(2025);
  });

  it('Step 9: Verify immutable audit trail with actor attribution', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/households/${householdId}/activity`,
      headers: {
        authorization: `Bearer ${aliceToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const activity = JSON.parse(res.body);
    expect(activity.length).toBeGreaterThanOrEqual(3);

    const eventTypes = activity.map((e: any) => e.eventType);
    expect(eventTypes).toContain(AuditEventType.HOUSEHOLD_CREATED);
    expect(eventTypes).toContain(AuditEventType.MEMBER_INVITED);
    expect(eventTypes).toContain(AuditEventType.MEMBER_JOINED);

    // Verify Bob's join was attributed to Bob
    const joinEvent = activity.find((e: any) => e.eventType === AuditEventType.MEMBER_JOINED);
    expect(joinEvent.actorId).toBe(bobId);

    // Verify Alice's invite was attributed to Alice
    const inviteEvent = activity.find((e: any) => e.eventType === AuditEventType.MEMBER_INVITED);
    expect(inviteEvent.actorId).toBe(aliceId);
  });
});
