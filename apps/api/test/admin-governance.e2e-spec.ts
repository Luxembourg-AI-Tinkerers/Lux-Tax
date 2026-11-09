import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Admin Governance & Model Registry (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let adminUserId: string;
  let ordinaryUserId: string;
  let ordinaryToken: string;

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

    // API-1: /api/admin/** is gated by the operator-managed ADMIN_EMAILS allowlist,
    // so the registered administrator must be allowlisted before the first admin call.
    process.env.ADMIN_EMAILS = uniqueEmail;

    // A second, ordinary taxpayer: registered, authenticated, no platform grant.
    const ordinaryEmail = `user-${Date.now()}@e2e.lu`;
    const ordinaryRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: ordinaryEmail,
        password: 'E2e-Password-1',
        firstName: 'Ordinary',
        lastName: 'Taxpayer',
      },
    });

    expect(ordinaryRes.statusCode).toBe(201);
    const ordinaryBody = JSON.parse(ordinaryRes.payload);
    ordinaryToken = ordinaryBody.tokens.accessToken;
    ordinaryUserId = ordinaryBody.user.id;
  });

  afterAll(async () => {
    if (prisma && adminUserId) {
      await prisma.auditEvent.deleteMany({ where: { actorId: adminUserId } });
      await prisma.session.deleteMany({ where: { userId: adminUserId } });
      await prisma.personProfile.deleteMany({ where: { userId: adminUserId } });
      await prisma.user.deleteMany({ where: { id: adminUserId } });
    }
    if (prisma && ordinaryUserId) {
      await prisma.auditEvent.deleteMany({ where: { actorId: ordinaryUserId } });
      await prisma.session.deleteMany({ where: { userId: ordinaryUserId } });
      await prisma.personProfile.deleteMany({ where: { userId: ordinaryUserId } });
      await prisma.user.deleteMany({ where: { id: ordinaryUserId } });
    }
    delete process.env.ADMIN_EMAILS;

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

  it('GET /api/admin/overview returns 403 for a registered non-admin user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/overview',
      headers: { authorization: `Bearer ${ordinaryToken}` },
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.payload).message).toBe('Platform administrator access required');
  });

  it('GET /api/admin/audit returns 403 for a registered non-admin user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/audit?limit=10',
      headers: { authorization: `Bearer ${ordinaryToken}` },
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.payload).message).toBe('Platform administrator access required');
  });

  describe('Custom Public AI Model Integration & Dynamic Routing', () => {
    let createdModelId: string;

    it('POST /api/admin/models registers a new custom public AI model', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/models',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          displayName: 'Mistral Large EU Public',
          providerType: 'CUSTOM_PUBLIC',
          modelIdentifier: 'mistral-large-latest',
          endpointUrl: 'https://api.mistral.ai/v1',
          apiKey: 'sk-mistral-test-secret-key-12345',
          capabilities: ['TEXT'],
          permittedDataClass: 'CUSTOMER_DOCUMENT',
          hostingRegion: 'EU_WEST_1',
          status: 'ACTIVE',
        },
      });

      expect(res.statusCode).toBe(201);
      const model = JSON.parse(res.payload);
      expect(model.id).toBeDefined();
      expect(model.displayName).toBe('Mistral Large EU Public');
      expect(model.providerType).toBe('CUSTOM_PUBLIC');
      expect(model.isCustom).toBe(true);
      expect(model.apiKeyMasked).toBeDefined();
      expect(model.apiKeyMasked).not.toContain('secret'); // Secret is masked
      createdModelId = model.id;
    });

    it('GET /api/admin/models includes the newly created custom model', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/models',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const models = JSON.parse(res.payload);
      const found = models.find((m: any) => m.id === createdModelId);
      expect(found).toBeDefined();
      expect(found.isCustom).toBe(true);
      expect(found.modelIdentifier).toBe('mistral-large-latest');
    });

    it('POST /api/admin/models/test probes the endpoint and returns latency diagnostics', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/models/test',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          modelId: createdModelId,
        },
      });

      expect(res.statusCode).toBe(201);
      const probeResult = JSON.parse(res.payload);
      expect(probeResult).toHaveProperty('latencyMs');
      expect(probeResult).toHaveProperty('statusCode');
      expect(probeResult).toHaveProperty('message');
      expect(probeResult).toHaveProperty('timestamp');
    });

    it('PUT /api/admin/model-routes/:id dynamically reassigns a route to use custom model', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/admin/model-routes/route-salary-cert',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          primaryModelId: createdModelId,
          fallbackModelIds: ['mdl-docling-v2'],
          activeRolloutPercentage: 75,
        },
      });

      expect(res.statusCode).toBe(200);
      const updatedRoute = JSON.parse(res.payload);
      expect(updatedRoute.primaryModelId).toBe(createdModelId);
      expect(updatedRoute.fallbackModelIds).toContain('mdl-docling-v2');
      expect(updatedRoute.activeRolloutPercentage).toBe(75);
    });

    it('DELETE /api/admin/models/:id prevents deleting a model actively used as primary route', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/admin/models/${createdModelId}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(res.statusCode).toBe(400);
      const err = JSON.parse(res.payload);
      expect(err.message).toContain('assigned as primary model');
    });

    it('DELETE /api/admin/models/:id successfully removes custom model after route is reassigned', async () => {
      // Reassign route back to default built-in
      await app.inject({
        method: 'PUT',
        url: '/api/admin/model-routes/route-salary-cert',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          primaryModelId: 'mdl-docling-v2',
          fallbackModelIds: ['mdl-qwen35-4b'],
          activeRolloutPercentage: 100,
        },
      });

      // Delete custom model
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/admin/models/${createdModelId}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);

      // Verify it no longer appears in GET /api/admin/models
      const listRes = await app.inject({
        method: 'GET',
        url: '/api/admin/models',
        headers: { authorization: `Bearer ${accessToken}` },
      });
      const models = JSON.parse(listRes.payload);
      expect(models.some((m: any) => m.id === createdModelId)).toBe(false);
    });
  });
});
