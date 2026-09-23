import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  HouseholdRole,
  DocumentType,
  DocumentVisibility,
  FactCategory,
} from '@luxtax/contracts';

describe('Dual-Spouse Freelance & Business Lifecycle (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  const timestamp = Date.now();
  const aliceEmail = `alice.freelance.${timestamp}@e2e.lu`;
  const bobEmail = `bob.freelance.${timestamp}@e2e.lu`;

  let aliceToken: string;
  let aliceId: string;
  let bobToken: string;
  let bobId: string;
  let householdId: string;
  let workspaceId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    // 1. Register Alice
    const aliceRegRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: aliceEmail,
        password: 'Password123!',
        firstName: 'Alice',
        lastName: 'Schmit',
      },
    });
    expect(aliceRegRes.statusCode).toBe(201);
    const aliceData = JSON.parse(aliceRegRes.payload);
    aliceToken = aliceData.tokens.accessToken;
    aliceId = aliceData.user.id;

    // 2. Register Bob
    const bobRegRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: bobEmail,
        password: 'Password123!',
        firstName: 'Bob',
        lastName: 'Schmit',
      },
    });
    expect(bobRegRes.statusCode).toBe(201);
    const bobData = JSON.parse(bobRegRes.payload);
    bobToken = bobData.tokens.accessToken;
    bobId = bobData.user.id;

    // 3. Alice creates Household
    const hhRes = await app.inject({
      method: 'POST',
      url: '/api/households',
      headers: { authorization: `Bearer ${aliceToken}` },
      payload: { name: 'Schmit Freelance Household' },
    });
    expect(hhRes.statusCode).toBe(201);
    householdId = JSON.parse(hhRes.payload).id;

    // 4. Alice invites Bob
    const inviteRes = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/invitations`,
      headers: { authorization: `Bearer ${aliceToken}` },
      payload: { email: bobEmail, role: HouseholdRole.CO_FILER },
    });
    expect(inviteRes.statusCode).toBe(201);
    const invitationToken = JSON.parse(inviteRes.payload).invitationToken;

    // 5. Bob accepts invitation
    const acceptRes = await app.inject({
      method: 'POST',
      url: '/api/households/invitations/accept',
      headers: { authorization: `Bearer ${bobToken}` },
      payload: { token: invitationToken },
    });
    expect(acceptRes.statusCode).toBe(201);

    // 6. Get 2025 workspace
    const wsRes = await app.inject({
      method: 'GET',
      url: `/api/households/${householdId}/workspaces/2025`,
      headers: { authorization: `Bearer ${aliceToken}` },
    });
    expect(wsRes.statusCode).toBe(200);
    workspaceId = JSON.parse(wsRes.payload).id;
  });

  afterAll(async () => {
    if (prisma) {
      const userIds = [aliceId, bobId].filter(Boolean);
      if (workspaceId) {
        await prisma.freelanceBusinessProfile.deleteMany({ where: { workspaceId } });
        await prisma.confirmedFact.deleteMany({ where: { workspaceId } });
        await prisma.extractedFact.deleteMany({ where: { workspaceId } });
        await prisma.documentExtraction.deleteMany({ where: { document: { workspaceId } } });
        await prisma.document.deleteMany({ where: { workspaceId } });
        await prisma.returnVersion.deleteMany({ where: { workspaceId } });
        await prisma.missingInformationItem.deleteMany({ where: { workspaceId } });
        await prisma.taxProfile.deleteMany({ where: { workspaceId } });
        await prisma.taxYearWorkspace.deleteMany({ where: { id: workspaceId } });
      }
      if (householdId) {
        await prisma.householdInvitation.deleteMany({ where: { householdId } });
        await prisma.householdMembership.deleteMany({ where: { householdId } });
        await prisma.household.deleteMany({ where: { id: householdId } });
      }
      if (userIds.length > 0) {
        await prisma.auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
        await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.personProfile.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
    }
    if (app) {
      await app.close();
    }
  });

  it('1. Allows each spouse to configure and retrieve their distinct freelance business profiles', async () => {
    // Alice sets profile
    const aliceProfileRes = await app.inject({
      method: 'PUT',
      url: `/api/workspaces/${workspaceId}/freelance/profiles/${aliceId}`,
      headers: { authorization: `Bearer ${aliceToken}` },
      payload: {
        businessName: 'Alice Cloud Architecture',
        activityType: 'IT Consulting & Cloud Engineering',
        taxIdOrVat: 'LU12345678',
        accountingType: 'CASH_BASIS',
      },
    });
    expect(aliceProfileRes.statusCode).toBe(200);
    const aliceProfile = JSON.parse(aliceProfileRes.payload);
    expect(aliceProfile.businessName).toBe('Alice Cloud Architecture');
    expect(aliceProfile.ownerId).toBe(aliceId);

    // Bob sets profile
    const bobProfileRes = await app.inject({
      method: 'PUT',
      url: `/api/workspaces/${workspaceId}/freelance/profiles/${bobId}`,
      headers: { authorization: `Bearer ${bobToken}` },
      payload: {
        businessName: 'Bob Studio Design',
        activityType: 'UX/UI & Product Design',
        taxIdOrVat: 'LU87654321',
        accountingType: 'CASH_BASIS',
      },
    });
    expect(bobProfileRes.statusCode).toBe(200);
    const bobProfile = JSON.parse(bobProfileRes.payload);
    expect(bobProfile.businessName).toBe('Bob Studio Design');
    expect(bobProfile.ownerId).toBe(bobId);

    // Get all profiles for the workspace
    const profilesRes = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/freelance/profiles`,
      headers: { authorization: `Bearer ${aliceToken}` },
    });
    expect(profilesRes.statusCode).toBe(200);
    const allProfiles = JSON.parse(profilesRes.payload);
    expect(allProfiles.length).toBe(2);
    expect(allProfiles.some((p: any) => p.ownerId === aliceId)).toBe(true);
    expect(allProfiles.some((p: any) => p.ownerId === bobId)).toBe(true);
  });

  it('2. Uploads freelance invoice and business expense for Alice and confirms facts', async () => {
    // Alice uploads freelance invoice
    const invoiceContent = Buffer.from(
      'FACTURE N 2025-001 CLIENT: FINTECH LUXEMBOURG S.A. Prestation de conseil architecture cloud Montant Total EUR 12000.00 Net a payer 12000.00 EUR'
    ).toString('base64');

    const invRes = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/documents`,
      headers: { authorization: `Bearer ${aliceToken}` },
      payload: {
        fileName: 'Invoice_Fintech_Lux_Alice.txt',
        fileContentBase64: invoiceContent,
        mimeType: 'text/plain',
        visibility: DocumentVisibility.INCLUDED_IN_RETURN,
        documentType: DocumentType.FREELANCE_INVOICE,
        ownerId: aliceId,
      },
    });
    expect(invRes.statusCode).toBe(201);
    const invDoc = JSON.parse(invRes.payload);
    expect(invDoc.ownerId).toBe(aliceId);
    expect(invDoc.documentType).toBe(DocumentType.FREELANCE_INVOICE);

    // Alice uploads business expense
    const expenseContent = Buffer.from(
      'FACTURE APPLE STORE LUXEMBOURG Materiel informatique professionnel MacBook Pro EUR 3000.00'
    ).toString('base64');

    const expRes = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/documents`,
      headers: { authorization: `Bearer ${aliceToken}` },
      payload: {
        fileName: 'Hardware_MacBook_Pro_Alice.txt',
        fileContentBase64: expenseContent,
        mimeType: 'text/plain',
        visibility: DocumentVisibility.INCLUDED_IN_RETURN,
        documentType: DocumentType.BUSINESS_EXPENSE,
        ownerId: aliceId,
      },
    });
    expect(expRes.statusCode).toBe(201);
    const expDoc = JSON.parse(expRes.payload);
    expect(expDoc.ownerId).toBe(aliceId);

    // Confirm facts for Alice
    await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/facts/confirm`,
      headers: { authorization: `Bearer ${aliceToken}` },
      payload: {
        category: FactCategory.FREELANCE_INCOME,
        fieldKey: 'freelance_invoice_alice',
        amount: '12000.00',
        currency: 'EUR',
        isIncludedInReturn: true,
        isSharedWithHousehold: true,
      },
    });

    await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/facts/confirm`,
      headers: { authorization: `Bearer ${aliceToken}` },
      payload: {
        category: FactCategory.BUSINESS_EXPENSE,
        fieldKey: 'business_hardware_alice',
        amount: '3000.00',
        currency: 'EUR',
        isIncludedInReturn: true,
        isSharedWithHousehold: true,
      },
    });
  });

  it('3. Uploads freelance invoice and business expense for Bob and confirms facts', async () => {
    // Bob uploads freelance invoice
    const bobInvoiceContent = Buffer.from(
      'FACTURE BOB STUDIO DESIGN Client: E-Commerce Europe UX Design System EUR 8000.00'
    ).toString('base64');

    const invRes = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/documents`,
      headers: { authorization: `Bearer ${bobToken}` },
      payload: {
        fileName: 'Invoice_Ecommerce_Bob.txt',
        fileContentBase64: bobInvoiceContent,
        mimeType: 'text/plain',
        visibility: DocumentVisibility.INCLUDED_IN_RETURN,
        documentType: DocumentType.FREELANCE_INVOICE,
        ownerId: bobId,
      },
    });
    expect(invRes.statusCode).toBe(201);
    const invDoc = JSON.parse(invRes.payload);
    expect(invDoc.ownerId).toBe(bobId);

    // Bob uploads business expense
    const bobExpenseContent = Buffer.from(
      'FACTURE COWORKING SPACES LUXEMBOURG Location bureau et abonnements logiciels EUR 1500.00'
    ).toString('base64');

    const expRes = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/documents`,
      headers: { authorization: `Bearer ${bobToken}` },
      payload: {
        fileName: 'Coworking_Bob.txt',
        fileContentBase64: bobExpenseContent,
        mimeType: 'text/plain',
        visibility: DocumentVisibility.INCLUDED_IN_RETURN,
        documentType: DocumentType.BUSINESS_EXPENSE,
        ownerId: bobId,
      },
    });
    expect(expRes.statusCode).toBe(201);
    const expDoc = JSON.parse(expRes.payload);
    expect(expDoc.ownerId).toBe(bobId);

    // Confirm facts for Bob
    await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/facts/confirm`,
      headers: { authorization: `Bearer ${bobToken}` },
      payload: {
        category: FactCategory.FREELANCE_INCOME,
        fieldKey: 'freelance_invoice_bob',
        amount: '8000.00',
        currency: 'EUR',
        isIncludedInReturn: true,
        isSharedWithHousehold: true,
      },
    });

    await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/facts/confirm`,
      headers: { authorization: `Bearer ${bobToken}` },
      payload: {
        category: FactCategory.BUSINESS_EXPENSE,
        fieldKey: 'business_coworking_bob',
        amount: '1500.00',
        currency: 'EUR',
        isIncludedInReturn: true,
        isSharedWithHousehold: true,
      },
    });
  });

  it('4. Calculates and verifies per-spouse freelance KPI metrics', async () => {
    // Alice metrics
    const aliceMetricsRes = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/freelance/metrics?ownerId=${aliceId}`,
      headers: { authorization: `Bearer ${aliceToken}` },
    });
    expect(aliceMetricsRes.statusCode).toBe(200);
    const aliceMetrics = JSON.parse(aliceMetricsRes.payload);
    expect(aliceMetrics.totalGrossRevenue).toBe(12000);
    expect(aliceMetrics.totalBusinessExpenses).toBe(3000);
    expect(aliceMetrics.netBusinessProfit).toBe(9000);
    expect(aliceMetrics.totalDocumentsCount).toBe(2);

    // Bob metrics
    const bobMetricsRes = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/freelance/metrics?ownerId=${bobId}`,
      headers: { authorization: `Bearer ${bobToken}` },
    });
    expect(bobMetricsRes.statusCode).toBe(200);
    const bobMetrics = JSON.parse(bobMetricsRes.payload);
    expect(bobMetrics.totalGrossRevenue).toBe(8000);
    expect(bobMetrics.totalBusinessExpenses).toBe(1500);
    expect(bobMetrics.netBusinessProfit).toBe(6500);
    expect(bobMetrics.totalDocumentsCount).toBe(2);

    // Household total metrics
    const totalMetricsRes = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/freelance/metrics`,
      headers: { authorization: `Bearer ${aliceToken}` },
    });
    expect(totalMetricsRes.statusCode).toBe(200);
    const totalMetrics = JSON.parse(totalMetricsRes.payload);
    expect(totalMetrics.totalGrossRevenue).toBe(20000);
    expect(totalMetrics.totalBusinessExpenses).toBe(4500);
    expect(totalMetrics.netBusinessProfit).toBe(15500);
    expect(totalMetrics.totalDocumentsCount).toBe(4);
  });

  it('5. Runs 2025 tax calculation and verifies Article 14/91 freelance breakdown and Form 100 boxes', async () => {
    const calcRes = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/calculate`,
      headers: { authorization: `Bearer ${aliceToken}` },
    });
    expect(calcRes.statusCode).toBe(201);
    const calc = JSON.parse(calcRes.payload);

    expect(calc.freelanceIncomeBreakdown).toBeDefined();
    expect(calc.freelanceIncomeBreakdown.primaryGrossRevenue).toBe(12000);
    expect(calc.freelanceIncomeBreakdown.primaryBusinessExpenses).toBe(3000);
    expect(calc.freelanceIncomeBreakdown.primaryNetProfit).toBe(9000);
    expect(calc.freelanceIncomeBreakdown.spouseGrossRevenue).toBe(8000);
    expect(calc.freelanceIncomeBreakdown.spouseBusinessExpenses).toBe(1500);
    expect(calc.freelanceIncomeBreakdown.spouseNetProfit).toBe(6500);
    expect(calc.freelanceIncomeBreakdown.totalFreelanceNetProfit).toBe(15500);

    // Verify taxable income equals combined net freelance profit minus statutory special expenses (€960 for Class 2)
    expect(calc.taxableIncome).toBe(14540);

    // Approve return to create ReturnVersion
    const approveRes = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/approve`,
      headers: { authorization: `Bearer ${aliceToken}` },
    });
    expect(approveRes.statusCode).toBe(201);

    // Verify Form 100 filing package boxes
    const filingRes = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/filing-package`,
      headers: { authorization: `Bearer ${aliceToken}` },
    });
    expect(filingRes.statusCode).toBe(201);
    const filingPkg = JSON.parse(filingRes.payload);

    const boxes = filingPkg.form100Boxes || [];
    const aliceIncomeBox = boxes.find((b: any) => b.boxNumber === '21');
    const aliceExpenseBox = boxes.find((b: any) => b.boxNumber === '23');
    const bobIncomeBox = boxes.find((b: any) => b.boxNumber === '22');
    const bobExpenseBox = boxes.find((b: any) => b.boxNumber === '24');

    expect(aliceIncomeBox).toBeDefined();
    expect(parseFloat(aliceIncomeBox.amount)).toBe(12000);
    expect(aliceExpenseBox).toBeDefined();
    expect(parseFloat(aliceExpenseBox.amount)).toBe(3000);
    expect(bobIncomeBox).toBeDefined();
    expect(parseFloat(bobIncomeBox.amount)).toBe(8000);
    expect(bobExpenseBox).toBeDefined();
    expect(parseFloat(bobExpenseBox.amount)).toBe(1500);
  });

  it('6. Successfully triggers 1-click freelance demo data loader', async () => {
    const demoRes = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/freelance/demo`,
      headers: { authorization: `Bearer ${aliceToken}` },
    });
    expect(demoRes.statusCode).toBe(201);
    const demo = JSON.parse(demoRes.payload);
    expect(demo.success).toBe(true);
    expect(demo.count).toBe(8);
  });
});
