import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { purgeAuditEvents } from './support/audit-purge';
import { verifyEmailFor } from './support/verify-email';
import {
  FilingRoute,
  HouseholdRole,
  TaxClass,
  WorkspaceStatus,
} from '@luxtax/contracts';

/**
 * PROD-2 regression, at the call sites the unit tests cannot reach.
 *
 * `requiredApproverIds` is unit-tested, but the deadlock lived in the service:
 * `approveReturn`, `recordFiling` and the history builder each computed the
 * required approvers themselves. When one of them still counted a VIEWER, a
 * Class 2 household with a read-only member became permanently unfilable: the
 * gate waited for an approval the VIEWER is forbidden to give (the write-role
 * guard answers 403), so `recordFiling` returned 400 for a fully approved
 * return.
 *
 * This suite builds that exact household through the public API — two filers
 * plus a VIEWER — approves as both filers, and files. It fails with
 * "Every required household member must approve" as soon as any call site
 * counts the viewer.
 */
describe('PROD-2 - a Class 2 household with a VIEWER can still be filed (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  const EMAILS = ['viewer.primary@e2e.lu', 'viewer.cofiler@e2e.lu', 'viewer.readonly@e2e.lu'];

  let tokenPrimary: string;
  let tokenCoFiler: string;
  let tokenViewer: string;
  let primaryId: string;
  let coFilerId: string;
  let viewerId: string;
  let householdId: string;
  let workspaceId: string;

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  const cleanup = async () => {
    if (!prisma) return;
    const users = await prisma.user.findMany({
      where: { email: { in: EMAILS } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    if (userIds.length === 0) return;

    await purgeAuditEvents(prisma, userIds);

    const workspaces = await prisma.taxYearWorkspace.findMany({
      where: { household: { createdById: { in: userIds } } },
      select: { id: true },
    });
    const wsIds = workspaces.map((w) => w.id);

    await prisma.filingRecord.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await prisma.assessment.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await prisma.filingPackage.deleteMany({
      where: { returnVersion: { workspaceId: { in: wsIds } } },
    });
    await prisma.returnApproval.deleteMany({
      where: { returnVersion: { workspaceId: { in: wsIds } } },
    });
    await prisma.returnVersion.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await prisma.calculationSnapshot.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await prisma.missingInformationItem.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await prisma.taxProfile.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await prisma.confirmedFact.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await prisma.extractedFact.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await prisma.documentExtraction.deleteMany({
      where: { document: { workspaceId: { in: wsIds } } },
    });
    await prisma.document.deleteMany({ where: { workspaceId: { in: wsIds } } });

    await prisma.taxYearWorkspace.deleteMany({ where: { id: { in: wsIds } } });
    await prisma.householdInvitation.deleteMany({
      where: { household: { createdById: { in: userIds } } },
    });
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

  const register = async (email: string, firstName: string) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email, password: 'Sup3r-secret-passphrase!', firstName, lastName: 'Viewer' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    return { token: body.tokens.accessToken as string, id: body.user.id as string };
  };

  const join = async (ownerToken: string, email: string, role: HouseholdRole) => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/invitations`,
      headers: auth(ownerToken),
      payload: { email, role },
    });
    expect(res.statusCode).toBe(201);
    const token = JSON.parse(res.payload).invitationToken as string;
    expect(token).toBeTruthy();
    // Invitation acceptance requires a proven address.
    expect(await verifyEmailFor(app, email)).toBeLessThan(300);
    return token;
  };

  const accept = async (token: string, invitationToken: string) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/households/invitations/accept',
      headers: auth(token),
      payload: { token: invitationToken },
    });
    expect(res.statusCode).toBe(201);
  };

  it('builds a Class 2 household of two filers and one VIEWER', async () => {
    await cleanup();

    const primary = await register(EMAILS[0], 'Jeanne');
    const coFiler = await register(EMAILS[1], 'Marc');
    const viewer = await register(EMAILS[2], 'Comptable');
    tokenPrimary = primary.token;
    primaryId = primary.id;
    tokenCoFiler = coFiler.token;
    coFilerId = coFiler.id;
    tokenViewer = viewer.token;
    viewerId = viewer.id;

    const resHousehold = await app.inject({
      method: 'POST',
      url: '/api/households',
      headers: auth(tokenPrimary),
      payload: { name: 'Viewer-Regression' },
    });
    expect(resHousehold.statusCode).toBe(201);
    householdId = JSON.parse(resHousehold.payload).id;

    await accept(tokenCoFiler, await join(tokenPrimary, EMAILS[1], HouseholdRole.CO_FILER));
    await accept(tokenViewer, await join(tokenPrimary, EMAILS[2], HouseholdRole.VIEWER));

    const resWs = await app.inject({
      method: 'GET',
      url: `/api/households/${householdId}/workspaces/2025`,
      headers: auth(tokenPrimary),
    });
    expect(resWs.statusCode).toBe(200);
    workspaceId = JSON.parse(resWs.payload).id;

    // The premise of the regression: a joint return with a read-only member.
    // With no questionnaire answered yet the engine keeps the stored class, so
    // this is the class every later step sees.
    await prisma.taxYearWorkspace.update({
      where: { id: workspaceId },
      data: { taxClass: TaxClass.CLASS_2 },
    });

    await prisma.confirmedFact.createMany({
      data: [
        {
          workspaceId,
          ownerId: primaryId,
          category: 'EMPLOYMENT_INCOME' as never,
          fieldKey: 'grossSalary',
          amount: 60_000,
          taxYear: 2025,
        },
        {
          workspaceId,
          ownerId: coFilerId,
          category: 'EMPLOYMENT_INCOME' as never,
          fieldKey: 'grossSalary',
          amount: 40_000,
          taxYear: 2025,
        },
      ],
    });

    const members = await prisma.householdMembership.findMany({
      where: { householdId, status: 'ACTIVE' },
      select: { userId: true, role: true },
    });
    expect(members).toHaveLength(3);
    expect(members.filter((m) => m.role === HouseholdRole.VIEWER)).toHaveLength(1);
  });

  it('calculates the joint return as Class 2', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/calculate`,
      headers: auth(tokenPrimary),
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.payload).taxClass).toBe(TaxClass.CLASS_2);
  });

  it('a VIEWER cannot approve, which is why they must not be required', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/approve`,
      headers: auth(tokenViewer),
    });
    // @Roles(PRIMARY_FILER, CO_FILER) rejects the read-only member. If this ever
    // starts succeeding, the premise of the fix changes and PROD-2 must be
    // re-derived rather than quietly kept.
    expect(res.statusCode).toBe(403);
  });

  it('two filers are enough: the return reaches APPROVED without the viewer', async () => {
    const first = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/approve`,
      headers: auth(tokenPrimary),
    });
    expect(first.statusCode).toBe(201);
    expect(JSON.parse(first.payload).bothSpousesApproved).toBe(false);

    const second = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/approve`,
      headers: auth(tokenCoFiler),
    });
    expect(second.statusCode).toBe(201);
    // Before the fix this stayed false: the viewer was counted, so "both"
    // could never be satisfied.
    expect(JSON.parse(second.payload).bothSpousesApproved).toBe(true);

    const ws = await prisma.taxYearWorkspace.findUnique({
      where: { id: workspaceId },
      select: { status: true },
    });
    expect(ws?.status).toBe(WorkspaceStatus.APPROVED);
  });

  it('the approved return can be recorded as filed', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/filing-record`,
      headers: auth(tokenPrimary),
      payload: {
        filedAt: '2026-11-10',
        route: FilingRoute.MYGUICHET_MANUAL,
        confirmationReference: 'PROD2-VIEWER-REGRESSION',
      },
    });
    // This is the regression: with a VIEWER counted as a required approver the
    // service answered 400 "Every required household member must approve the
    // return before it is filed".
    expect(res.statusCode).toBe(201);
    const record = JSON.parse(res.payload);
    expect(record.confirmationReference).toBe('PROD2-VIEWER-REGRESSION');

    const ws = await prisma.taxYearWorkspace.findUnique({
      where: { id: workspaceId },
      select: { status: true },
    });
    expect(ws?.status).toBe(WorkspaceStatus.FILED);

    const version = await prisma.returnVersion.findFirst({
      where: { workspaceId, isFrozen: true },
      select: { versionNumber: true },
    });
    expect(version).not.toBeNull();
  });

  it('the version history agrees that the return is approved, not stuck', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/return-versions`,
      headers: auth(tokenPrimary),
    });
    expect(res.statusCode).toBe(200);
    const history = JSON.parse(res.payload);
    expect(history.workspaceId).toBe(workspaceId);
    const active = (history.versions as Array<{ versionNumber: number; status: string }>).find(
      (h) => h.versionNumber === history.activeReturnVersion,
    );
    expect(active).toBeDefined();
    // Approved by both filers and then frozen by the filing record.
    expect(active?.status).toBe('APPROVED');
  });
});
