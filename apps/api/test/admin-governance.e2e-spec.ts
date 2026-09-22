import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Admin Governance & Model Registry (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let adminUserId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    // Register an admin user using app.inject
    const uniqueEmail = `admin-${Date.now()}@e2e.lu`;
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: uniqueEmail,
        password: 'AdminPassword123!',
        firstName: 'System',
        lastName: 'Admin',
      },
    });

    expect(regRes.statusCode).toBe(201);
    const body = JSON.parse(regRes.payload);
    accessToken = body.tokens.accessToken;
    adminUserId = body.user.id;
  });

  afterAll(async () => {
    if (prisma && adminUserId) {
      await prisma.auditEvent.deleteMany({ where: { actorId: adminUserId } });
      await prisma.session.deleteMany({ where: { userId: adminUserId } });
      await prisma.personProfile.deleteMany({ where: { userId: adminUserId } });
      await prisma.user.deleteMany({ where: { id: adminUserId } });
    }
    if (app) {
      await app.close();
    }
  });

  it('GET /api/admin/overview returns service health and aggregate metrics', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/overview',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.serviceHealth).toBe('HEALTHY');
    expect(body.activeTaxYears).toContain(2025);
    expect(body.registeredModelsCount).toBeGreaterThan(0);
    expect(body.activeRoutesCount).toBeGreaterThan(0);
  });

  it('GET /api/admin/tax-rules returns immutable 2025 rule package with checksum', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/tax-rules',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    const rule2025 = body.find((r: any) => r.taxYear === 2025);
    expect(rule2025).toBeDefined();
    expect(rule2025.progressiveScaleBrackets).toBe(23);
    expect(rule2025.splittingMethodEnabled).toBe(true);
    expect(rule2025.packageChecksum).toHaveLength(64); // SHA-256
    expect(rule2025.status).toBe('ACTIVE');
  });

  it('GET /api/admin/deadlines returns official filing dates and statutory deadlines', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/deadlines',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body.some((d: any) => d.code === 'FILING_DEADLINE_LEGAL')).toBe(true);
    expect(body.every((d: any) => d.officialSourceUrl.startsWith('https://'))).toBe(true);
  });

  it('GET /api/admin/forms returns Form 100 mappings', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/forms',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
    const form100 = body.find((f: any) => f.formCode === 'FORM_100');
    expect(form100).toBeDefined();
    expect(form100.boxMappings.length).toBeGreaterThan(0);
    expect(form100.boxMappings.some((b: any) => b.boxNumber === '101')).toBe(true);
  });

  it('GET /api/admin/models returns registered models and data classifications', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/models',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((m: any) => m.modelIdentifier.includes('docling'))).toBe(true);
    expect(body.some((m: any) => m.modelIdentifier.includes('qwen'))).toBe(true);
    expect(body.every((m: any) => m.healthy === true)).toBe(true);
  });

  it('GET /api/admin/model-routes returns active task routes with fallbacks', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/model-routes',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
    const salaryRoute = body.find((r: any) => r.taskName === 'document.extract.salary_certificate');
    expect(salaryRoute).toBeDefined();
    expect(salaryRoute.primaryModelId).toBeDefined();
    expect(salaryRoute.maxDataClass).toBe('CUSTOMER_DOCUMENT');
  });

  it('GET /api/admin/evaluations returns golden benchmark results passing quality thresholds', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/evaluations',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body.every((e: any) => e.passedThreshold === true)).toBe(true);
    expect(body.every((e: any) => e.exactMatchRate >= 0.9)).toBe(true);
  });

  it('GET /api/admin/audit returns platform audit trail', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/audit?limit=10',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });
});
