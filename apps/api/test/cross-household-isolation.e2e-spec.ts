import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { purgeAuditEvents } from './support/audit-purge';
import { randomUUID } from 'node:crypto';

describe('Cross-Household Isolation & Security (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  let victimToken: string;
  let victimHouseholdId: string;
  let victimWorkspaceId: string;
  let attackerToken: string;
  let attackerHouseholdId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    // 1. Register Victim (Alice)
    const aliceRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'victim.isolation@example.lu',
        password: 'Password123!',
      },
    });
    victimToken = JSON.parse(aliceRes.body).tokens.accessToken;

    // Create Victim Household
    const hhRes = await app.inject({
      method: 'POST',
      url: '/api/households',
      headers: { authorization: `Bearer ${victimToken}` },
      payload: { name: 'Victim Household' },
    });
    victimHouseholdId = JSON.parse(hhRes.body).id;

    // Victim 2025 workspace (created with the household) is the target of the
    // body-id spoofing cases below.
    const wsRes = await app.inject({
      method: 'GET',
      url: `/api/households/${victimHouseholdId}/workspaces/2025`,
      headers: { authorization: `Bearer ${victimToken}` },
    });
    expect(wsRes.statusCode).toBe(200);
    victimWorkspaceId = JSON.parse(wsRes.body).id;
    expect(typeof victimWorkspaceId).toBe('string');

    // 2. Register Attacker (Charlie)
    const charlieRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'attacker.isolation@example.lu',
        password: 'Password123!',
      },
    });
    attackerToken = JSON.parse(charlieRes.body).tokens.accessToken;

    // The attacker's own household: the id it tries to smuggle in the body.
    const attackerHhRes = await app.inject({
      method: 'POST',
      url: '/api/households',
      headers: { authorization: `Bearer ${attackerToken}` },
      payload: { name: 'Attacker Household' },
    });
    expect(attackerHhRes.statusCode).toBe(201);
    attackerHouseholdId = JSON.parse(attackerHhRes.body).id;
  });

  afterAll(async () => {
    if (prisma) {
      const testEmails = ['victim.isolation@example.lu', 'attacker.isolation@example.lu'];
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

  it('Attacker cannot view victim household details', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/households/${victimHouseholdId}`,
      headers: { authorization: `Bearer ${attackerToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('Attacker cannot view victim tax year workspace', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/households/${victimHouseholdId}/workspaces/2025`,
      headers: { authorization: `Bearer ${attackerToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('Attacker cannot invite members to victim household', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/households/${victimHouseholdId}/invitations`,
      headers: { authorization: `Bearer ${attackerToken}` },
      payload: {
        email: 'intruder@example.lu',
        role: 'CO_FILER',
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('Attacker cannot read victim household audit log', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/households/${victimHouseholdId}/activity`,
      headers: { authorization: `Bearer ${attackerToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('Attacker cannot calculate in a non-existent workspace', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${randomUUID()}/calculate`,
      headers: { authorization: `Bearer ${attackerToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('Attacker cannot read a calculation from a non-existent workspace', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${randomUUID()}/calculation`,
      headers: { authorization: `Bearer ${attackerToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('Attacker cannot calculate in the victim workspace by spoofing body.householdId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${victimWorkspaceId}/calculate`,
      headers: { authorization: `Bearer ${attackerToken}` },
      payload: { householdId: attackerHouseholdId },
    });
    expect(res.statusCode).toBe(403);
  });

  it('Attacker cannot read a calculation from the victim workspace', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${victimWorkspaceId}/calculation`,
      headers: { authorization: `Bearer ${attackerToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
