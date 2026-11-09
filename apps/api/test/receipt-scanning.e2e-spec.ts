import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { DocumentVisibility, DocumentType } from '@luxtax/contracts';

describe('Receipt & Camera Document Scanning with AI Model Extraction (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let token: string;
  let userId: string;
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

    // Register user
    const email = `filer-scanner-${Date.now()}@e2e.lu`;
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email,
        password: 'Password123!',
        firstName: 'Camille',
        lastName: 'Schmit',
      },
    });
    expect(regRes.statusCode).toBe(201);
    const regBody = JSON.parse(regRes.payload);
    token = regBody.tokens.accessToken;
    userId = regBody.user.id;

    // Create household
    const hhRes = await app.inject({
      method: 'POST',
      url: '/api/households',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Schmit Household' },
    });
    expect(hhRes.statusCode).toBe(201);
    householdId = JSON.parse(hhRes.payload).id;

    // Get 2025 workspace
    const wsRes = await app.inject({
      method: 'GET',
      url: `/api/households/${householdId}/workspaces/2025`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(wsRes.statusCode).toBe(200);
    workspaceId = JSON.parse(wsRes.payload).id;
  });

  afterAll(async () => {
    if (prisma && userId) {
      if (workspaceId) {
        await prisma.extractedFact.deleteMany({ where: { workspaceId } });
        await prisma.documentExtraction.deleteMany({ where: { document: { workspaceId } } });
        await prisma.document.deleteMany({ where: { workspaceId } });
        await prisma.taxYearWorkspace.deleteMany({ where: { id: workspaceId } });
      }
      if (householdId) {
        await prisma.householdMembership.deleteMany({ where: { householdId } });
        await prisma.household.deleteMany({ where: { id: householdId } });
      }
      await prisma.auditEvent.deleteMany({ where: { actorId: userId } });
      await prisma.session.deleteMany({ where: { userId } });
      await prisma.personProfile.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    if (app) {
      await app.close();
    }
  });

  it('uploads a phone-scanned childcare receipt (JPEG) and extracts childcare facts via AI model route', async () => {
    // 1x1 transparent PNG / simulated JPEG receipt payload
    const simulatedChildcareReceiptImage = Buffer.from(
      'FACTURE CRECHE LA MAISON DES ENFANTS LUXEMBOURG Garde d enfant Octobre 2025 Montant Total EUR 450.00 TVA 0.00 EUR Net a payer 450.00 EUR'
    ).toString('base64');

    const res = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/documents`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        fileName: 'scan_receipt_creche_oct2025.jpg',
        fileContentBase64: simulatedChildcareReceiptImage,
        mimeType: 'image/jpeg',
      },
    });

    expect(res.statusCode).toBe(201);
    const doc = JSON.parse(res.payload);
    expect(doc.id).toBeDefined();
    expect(doc.visibility).toBe(DocumentVisibility.PRIVATE_DRAFT);
    expect(doc.documentType).toBe(DocumentType.CHILDCARE_INVOICE);
    expect(doc.extractedFactsCount).toBeGreaterThanOrEqual(1);

    // Uploads are private drafts; the requested state is applied afterwards.
    const visRes = await app.inject({
      method: 'PATCH',
      url: `/api/workspaces/${workspaceId}/documents/${doc.id}/visibility`,
      headers: { authorization: `Bearer ${token}` },
      payload: { visibility: DocumentVisibility.INCLUDED_IN_RETURN },
    });
    expect(visRes.statusCode).toBe(200);

    // Verify extracted facts in workspace
    const factsRes = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/facts`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(factsRes.statusCode).toBe(200);
    const factsBody = JSON.parse(factsRes.payload);
    const childcareFact = factsBody.extractedFacts.find((f: any) => f.fieldName === 'childcareExpense');
    expect(childcareFact).toBeDefined();
    expect(Number(childcareFact.fieldValue)).toBe(450);
  });

  it('uploads a phone-scanned charitable donation receipt (PNG) and extracts donation facts', async () => {
    const simulatedDonationReceiptImage = Buffer.from(
      'CROIX-ROUGE LUXEMBOURGEOISE ATTESTATION DE DON ART 112 LIR Nous certifions avoir recu un don de 250.00 EUR pour l annee 2025'
    ).toString('base64');

    const res = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/documents`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        fileName: 'camera_scan_croix_rouge_don.png',
        fileContentBase64: simulatedDonationReceiptImage,
        mimeType: 'image/png',
      },
    });

    expect(res.statusCode).toBe(201);
    const doc = JSON.parse(res.payload);
    expect(doc.visibility).toBe(DocumentVisibility.PRIVATE_DRAFT);
    expect(doc.documentType).toBe(DocumentType.DONATION_CERTIFICATE);

    // Promote the private draft before its facts may enter the return.
    const visRes = await app.inject({
      method: 'PATCH',
      url: `/api/workspaces/${workspaceId}/documents/${doc.id}/visibility`,
      headers: { authorization: `Bearer ${token}` },
      payload: { visibility: DocumentVisibility.INCLUDED_IN_RETURN },
    });
    expect(visRes.statusCode).toBe(200);

    const factsRes = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/facts`,
      headers: { authorization: `Bearer ${token}` },
    });
    const donationFact = JSON.parse(factsRes.payload).extractedFacts.find(
      (f: any) => f.fieldName === 'donationAmount'
    );
    expect(donationFact).toBeDefined();
    expect(Number(donationFact.fieldValue)).toBe(250);
  });

  it('deduplicates scanned receipt photos by rejecting identical SHA-256 uploads', async () => {
    const simulatedImage = Buffer.from('DUPLICATE RECEIPT SCAN CONTENT').toString('base64');

    const first = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/documents`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        fileName: 'receipt_first.jpg',
        fileContentBase64: simulatedImage,
        mimeType: 'image/jpeg',
      },
    });
    expect(first.statusCode).toBe(201);

    const dup = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/documents`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        fileName: 'receipt_second.jpg',
        fileContentBase64: simulatedImage,
        mimeType: 'image/jpeg',
      },
    });
    expect(dup.statusCode).toBe(400);
    expect(JSON.parse(dup.payload).message).toContain('Duplicate document');
  });

  it('allows taxpayer to confirm candidate facts extracted from camera scans', async () => {
    const factsRes = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/facts`,
      headers: { authorization: `Bearer ${token}` },
    });
    const unconfirmed = JSON.parse(factsRes.payload).extractedFacts.find((f: any) => !f.isConfirmed);
    expect(unconfirmed).toBeDefined();

    const confirmRes = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/facts/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        extractedFactId: unconfirmed.id,
        category: 'CHILDCARE_EXPENSE',
        fieldKey: unconfirmed.fieldName,
        amount: Number(unconfirmed.fieldValue).toFixed(2),
        currency: 'EUR',
        isIncludedInReturn: true,
      },
    });
    expect(confirmRes.statusCode).toBe(201);
    const confirmed = JSON.parse(confirmRes.payload);
    expect(confirmed.id).toBeDefined();
    expect(confirmed.extractedFactId).toBe(unconfirmed.id);
    // The scan was promoted before confirmation, so the fact may join the return.
    expect(confirmed.isIncludedInReturn).toBe(true);
  });

  it('uploads a professional training course invoice and populates trainingCourseExpense fact', async () => {
    const courseInvoice = Buffer.from(
      'INSTITUT DE FORMATION LUXEMBOURG Facture Formation Continue Professionnelle Data Analytics & AI Course Total EUR 850.00 Net a payer 850.00 EUR'
    ).toString('base64');

    const res = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/documents`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        fileName: 'invoice_training_course_2025.pdf',
        fileContentBase64: courseInvoice,
        mimeType: 'application/pdf',
      },
    });

    expect(res.statusCode).toBe(201);
    const doc = JSON.parse(res.payload);
    expect(doc.id).toBeDefined();
    expect(doc.visibility).toBe(DocumentVisibility.PRIVATE_DRAFT);

    const visRes = await app.inject({
      method: 'PATCH',
      url: `/api/workspaces/${workspaceId}/documents/${doc.id}/visibility`,
      headers: { authorization: `Bearer ${token}` },
      payload: { visibility: DocumentVisibility.INCLUDED_IN_RETURN },
    });
    expect(visRes.statusCode).toBe(200);

    const factsRes = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/facts`,
      headers: { authorization: `Bearer ${token}` },
    });
    const courseFact = JSON.parse(factsRes.payload).extractedFacts.find(
      (f: any) => f.fieldName === 'trainingCourseExpense'
    );
    expect(courseFact).toBeDefined();
    expect(Number(courseFact.fieldValue)).toBe(850);
  });

  it('uploads a work-related equipment receipt and populates workRelatedExpense fact', async () => {
    const workReceipt = Buffer.from(
      'COMPUTERSHOP LUXEMBOURG Facture Equipement Professionnel Travail Télétravail Laptop Screen Montant Total 420.00 EUR'
    ).toString('base64');

    const res = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/documents`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        fileName: 'scan_work_laptop_screen.jpg',
        fileContentBase64: workReceipt,
        mimeType: 'image/jpeg',
      },
    });

    expect(res.statusCode).toBe(201);
    const doc = JSON.parse(res.payload);
    expect(doc.id).toBeDefined();
    expect(doc.visibility).toBe(DocumentVisibility.PRIVATE_DRAFT);

    const visRes = await app.inject({
      method: 'PATCH',
      url: `/api/workspaces/${workspaceId}/documents/${doc.id}/visibility`,
      headers: { authorization: `Bearer ${token}` },
      payload: { visibility: DocumentVisibility.INCLUDED_IN_RETURN },
    });
    expect(visRes.statusCode).toBe(200);

    const factsRes = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/facts`,
      headers: { authorization: `Bearer ${token}` },
    });
    const workFact = JSON.parse(factsRes.payload).extractedFacts.find(
      (f: any) => f.fieldName === 'workRelatedExpense'
    );
    expect(workFact).toBeDefined();
    expect(Number(workFact.fieldValue)).toBe(420);
  });
});

