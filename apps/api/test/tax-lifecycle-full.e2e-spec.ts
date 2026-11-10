import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { purgeAuditEvents } from './support/audit-purge';
import { verifyEmailFor } from './support/verify-email';
import {
  HouseholdRole,
  WorkspaceStatus,
  DocumentVisibility,
  DocumentType,
  FactCategory,
  TaxClass,
  AuditEventType,
} from '@luxtax/contracts';

describe('Luxembourg Tax Workspace - Full Lifecycle (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  let tokenA: string;
  let userAId: string;
  let tokenB: string;
  let userBId: string;
  let householdId: string;
  let workspaceId: string;
  let documentId: string;
  let salaryFactId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  const cleanupTestUsers = async () => {
    if (!prisma) return;
    const testEmails = ['spouse.a@e2e.lu', 'spouse.b@e2e.lu'];
    const users = await prisma.user.findMany({
      where: { email: { in: testEmails } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
      // Audit rows are append-only; purge the test actors' rows inside
      // an opted-in transaction so the rest of the cleanup can run.
      await purgeAuditEvents(prisma, userIds);

    if (userIds.length > 0) {
      const workspaces = await prisma.taxYearWorkspace.findMany({
        where: { household: { createdById: { in: userIds } } },
        select: { id: true },
      });
      const wsIds = workspaces.map((w) => w.id);

      await prisma.assessment.deleteMany({ where: { workspaceId: { in: wsIds } } });
      await prisma.filingPackage.deleteMany({ where: { returnVersion: { workspaceId: { in: wsIds } } } });
      await prisma.returnApproval.deleteMany({ where: { returnVersion: { workspaceId: { in: wsIds } } } });
      await prisma.returnVersion.deleteMany({ where: { workspaceId: { in: wsIds } } });
      await prisma.missingInformationItem.deleteMany({ where: { workspaceId: { in: wsIds } } });
      await prisma.taxProfile.deleteMany({ where: { workspaceId: { in: wsIds } } });
      await prisma.confirmedFact.deleteMany({ where: { workspaceId: { in: wsIds } } });
      await prisma.extractedFact.deleteMany({ where: { workspaceId: { in: wsIds } } });
      await prisma.documentExtraction.deleteMany({ where: { document: { workspaceId: { in: wsIds } } } });
      await prisma.document.deleteMany({ where: { workspaceId: { in: wsIds } } });

      // Audit rows are append-only (API-10): a trigger rejects DELETE, so no
      // cleanup is attempted here. Removing the user leaves them unlinked.


      await prisma.taxYearWorkspace.deleteMany({ where: { id: { in: wsIds } } });
      await prisma.householdInvitation.deleteMany({ where: { household: { createdById: { in: userIds } } } });
      await prisma.householdMembership.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.household.deleteMany({ where: { createdById: { in: userIds } } });
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.personProfile.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  };

  beforeEach(async () => {
    // start fresh for test runs
  });

  afterAll(async () => {
    await cleanupTestUsers();
    if (app) {
      await app.close();
    }
  });

  it('Step 1: Register Spouse A, Spouse B, create joint household and init 2025 workspace', async () => {
    await cleanupTestUsers();

    // Register Spouse A
    const resA = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'spouse.a@e2e.lu',
        password: 'Password123!',
        firstName: 'Jean',
        lastName: 'Weber',
      },
    });
    expect(resA.statusCode).toBe(201);
    const bodyA = JSON.parse(resA.payload);
    tokenA = bodyA.tokens.accessToken;
    userAId = bodyA.user.id;

    // Register Spouse B
    const resB = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'spouse.b@e2e.lu',
        password: 'Password123!',
        firstName: 'Marie',
        lastName: 'Weber',
      },
    });
    expect(resB.statusCode).toBe(201);
    const bodyB = JSON.parse(resB.payload);
    tokenB = bodyB.tokens.accessToken;
    userBId = bodyB.user.id;

    // Spouse A creates Household
    const resH = await app.inject({
      method: 'POST',
      url: '/api/households',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { name: 'Weber-Family' },
    });
    expect(resH.statusCode).toBe(201);
    householdId = JSON.parse(resH.payload).id;

    // Spouse A invites Spouse B
    const resInv = await app.inject({
      method: 'POST',
      url: `/api/households/${householdId}/invitations`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { email: 'spouse.b@e2e.lu', role: HouseholdRole.CO_FILER },
    });
    expect(resInv.statusCode).toBe(201);
    const invToken = JSON.parse(resInv.payload).invitationToken;

    // The spouse's address must be proven before acceptance.
    await verifyEmailFor(app, 'spouse.b@e2e.lu');

    // Spouse B accepts invitation
    // Spouse B accepts invitation
    const resAcc = await app.inject({
      method: 'POST',
      url: '/api/households/invitations/accept',
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { token: invToken },
    });
    expect(resAcc.statusCode).toBe(201);

    // Get initial 2025 Workspace created with household
    const resWs = await app.inject({
      method: 'GET',
      url: `/api/households/${householdId}/workspaces/2025`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(resWs.statusCode).toBe(200);
    workspaceId = JSON.parse(resWs.payload).id;
    expect(workspaceId).toBeDefined();
  });

  it('Step 2: Upload salary certificate, verify OCR extraction and deduplication check', async () => {
    const certificateText = `
      GRAND-DUCHÉ DE LUXEMBOURG
      CERTIFICAT DE RÉMUNÉRATION 2025
      Employeur: Amazon EU S.à r.l.
      Salarié: Jean Weber
      Code 101 - Rémunération brute: 75000.00 EUR
      Code 103 - Cotisations de sécurité sociale: 9000.00 EUR
      Code 105 - Retenue d'impôt: 12500.00 EUR
    `;
    const base64Content = Buffer.from(certificateText).toString('base64');

    // Upload document as Private Draft
    const resUpload = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/documents`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        fileName: 'certificat_salaire_2025.txt',
        fileContentBase64: base64Content,
        mimeType: 'text/plain',
        visibility: DocumentVisibility.PRIVATE_DRAFT,
      },
    });

    expect(resUpload.statusCode).toBe(201);
    const doc = JSON.parse(resUpload.payload);
    documentId = doc.id;
    expect(doc.documentType).toBe(DocumentType.SALARY_CERTIFICATE);
    expect(doc.extractedFactsCount).toBeGreaterThanOrEqual(3);

    // Deduplication test: re-uploading identical file must be rejected with 400
    const resDup = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/documents`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        fileName: 'certificat_salaire_2025_copy.txt',
        fileContentBase64: base64Content,
        mimeType: 'text/plain',
      },
    });
    expect(resDup.statusCode).toBe(400);
    expect(JSON.parse(resDup.payload).message).toContain('Duplicate document');

    // Visibility test: Private Draft is invisible to Spouse B
    const resListB = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/documents`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(resListB.statusCode).toBe(200);
    expect(JSON.parse(resListB.payload).length).toBe(0);

    // Private Draft facts are invisible to Spouse B as well
    const resFactsBPrivate = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/facts`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(resFactsBPrivate.statusCode).toBe(200);
    const factsBPrivate = JSON.parse(resFactsBPrivate.payload);
    expect(factsBPrivate.extractedFacts.length).toBe(0);
    expect(factsBPrivate.confirmedFacts.length).toBe(0);

    // Spouse A updates visibility to SHARED_FOR_DISCUSSION
    const resVis = await app.inject({
      method: 'PATCH',
      url: `/api/workspaces/${workspaceId}/documents/${documentId}/visibility`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { visibility: DocumentVisibility.SHARED_FOR_DISCUSSION },
    });
    expect(resVis.statusCode).toBe(200);

    // Now visible to Spouse B
    const resListBAfter = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/documents`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(JSON.parse(resListBAfter.payload).length).toBe(1);
  });

  it('Step 3: Confirm extracted facts and answer guided questionnaire', async () => {
    // List extracted facts
    const resFacts = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/facts`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(resFacts.statusCode).toBe(200);
    const { extractedFacts } = JSON.parse(resFacts.payload);
    expect(extractedFacts.length).toBeGreaterThanOrEqual(3);

    // A document must be proposed for the return before its facts may enter the
    // joint calculation; SHARED_FOR_DISCUSSION is discussion-only.
    const resPromote = await app.inject({
      method: 'PATCH',
      url: `/api/workspaces/${workspaceId}/documents/${documentId}/visibility`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { visibility: DocumentVisibility.PROPOSED_FOR_RETURN },
    });
    expect(resPromote.statusCode).toBe(200);

    const grossFact = extractedFacts.find((f: any) => f.fieldName === 'grossSalary');
    const socialFact = extractedFacts.find((f: any) => f.fieldName === 'socialSecurity');
    const taxFact = extractedFacts.find((f: any) => f.fieldName === 'withholdingTax');

    expect(grossFact).toBeDefined();

    // Confirm Gross Salary
    const resConfGross = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/facts/confirm`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        extractedFactId: grossFact.id,
        category: FactCategory.EMPLOYMENT_INCOME,
        fieldKey: 'grossSalary',
        amount: grossFact.fieldValue,
      },
    });
    expect(resConfGross.statusCode).toBe(201);
    const grossConfirmed = JSON.parse(resConfGross.payload);
    salaryFactId = grossConfirmed.id;
    expect(grossConfirmed.isIncludedInReturn).toBe(true);

    // Confirm Social Contributions
    await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/facts/confirm`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        extractedFactId: socialFact.id,
        category: FactCategory.EMPLOYMENT_INCOME,
        fieldKey: 'socialSecurity',
        amount: socialFact.fieldValue,
      },
    });

    // Confirm Withholding Tax
    await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/facts/confirm`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        extractedFactId: taxFact.id,
        category: FactCategory.EMPLOYMENT_INCOME,
        fieldKey: 'withholdingTax',
        amount: taxFact.fieldValue,
      },
    });

    // Save Guided Questionnaire
    const resQuest = await app.inject({
      method: 'PUT',
      url: `/api/workspaces/${workspaceId}/questionnaire`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        maritalStatus: 'MARRIED',
        hasEmploymentIncome: true,
        hasPensionIncome: false,
        hasPrimaryResidenceMortgage: false,
        hasLifeInsuranceOrPensionPlan: false,
        hasDonations: false,
        childrenCount: 0,
      },
    });
    expect(resQuest.statusCode).toBe(200);
    const qBody = JSON.parse(resQuest.payload);
    expect(qBody.readiness.completionScore).toBeGreaterThan(50);
  });

  it('Step 3b: shared-for-discussion documents and spoofed uploads stay out of the return', async () => {
    // Spouse B uploads her own salary certificate. The upload is forced to
    // PRIVATE_DRAFT regardless of the body.
    const secondCertificate = `
      CERTIFICAT DE REMUNERATION 2025
      Employeur: Amazon EU S.a r.l.
      Salarie: Marie Weber
      Code 101 - Remuneration brute: 20000.00 EUR
      Code 103 - Cotisations de securite sociale: 2400.00 EUR
      Code 105 - Retenue d'impot: 1000.00 EUR
    `;
    const secondBase64 = Buffer.from(secondCertificate).toString('base64');

    const resUploadSecond = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/documents`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: {
        fileName: 'certificat_salaire_marie_2025.txt',
        fileContentBase64: secondBase64,
        mimeType: 'text/plain',
      },
    });
    expect(resUploadSecond.statusCode).toBe(201);
    const secondDoc = JSON.parse(resUploadSecond.payload);
    expect(secondDoc.visibility).toBe(DocumentVisibility.PRIVATE_DRAFT);
    expect(secondDoc.ownerId).toBe(userBId);

    // An active household member may be named as owner (upload on behalf of a
    // spouse), but the document still starts as a private draft.
    const resSpouseOwner = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/documents`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: {
        fileName: 'spouse_attributed.txt',
        fileContentBase64: Buffer.from('SPOUSE ATTRIBUTION ATTEMPT').toString('base64'),
        mimeType: 'text/plain',
        ownerId: userAId,
      },
    });
    expect(resSpouseOwner.statusCode).toBe(201);
    const spouseOwnedDoc = JSON.parse(resSpouseOwner.payload);
    expect(spouseOwnedDoc.ownerId).toBe(userAId);
    expect(spouseOwnedDoc.uploaderId).toBe(userBId);
    expect(spouseOwnedDoc.visibility).toBe(DocumentVisibility.PRIVATE_DRAFT);

    // An owner from outside the household, or a non-private visibility in the
    // body, is rejected.
    const resSpoofedOwner = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/documents`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: {
        fileName: 'spoofed_owner.txt',
        fileContentBase64: Buffer.from('SPOOFED OWNER ATTEMPT').toString('base64'),
        mimeType: 'text/plain',
        ownerId: '00000000-0000-4000-8000-000000000000',
      },
    });
    expect(resSpoofedOwner.statusCode).toBe(400);

    const resSpoofedVisibility = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/documents`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: {
        fileName: 'spoofed_visibility.txt',
        fileContentBase64: Buffer.from('SPOOFED VISIBILITY ATTEMPT').toString('base64'),
        mimeType: 'text/plain',
        visibility: DocumentVisibility.INCLUDED_IN_RETURN,
      },
    });
    expect(resSpoofedVisibility.statusCode).toBe(400);

    // Keep the second document in discussion: its facts must not reach the return.
    const resShareSecond = await app.inject({
      method: 'PATCH',
      url: `/api/workspaces/${workspaceId}/documents/${secondDoc.id}/visibility`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { visibility: DocumentVisibility.SHARED_FOR_DISCUSSION },
    });
    expect(resShareSecond.statusCode).toBe(200);

    const resFactsB = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/facts`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(resFactsB.statusCode).toBe(200);
    const factsB = JSON.parse(resFactsB.payload);
    const marieGross = factsB.extractedFacts.find(
      (f: any) => f.fieldName === 'grossSalary' && f.documentId === secondDoc.id,
    );
    expect(marieGross).toBeDefined();

    const resConfirmShared = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/facts/confirm`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: {
        extractedFactId: marieGross.id,
        category: FactCategory.EMPLOYMENT_INCOME,
        fieldKey: 'grossSalary',
        amount: marieGross.fieldValue,
        isIncludedInReturn: true,
      },
    });
    expect(resConfirmShared.statusCode).toBe(201);
    // The body asked for inclusion, but SHARED_FOR_DISCUSSION cannot enter the return.
    expect(JSON.parse(resConfirmShared.payload).isIncludedInReturn).toBe(false);

    const resCalcShared = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/calculate`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(resCalcShared.statusCode).toBe(201);
    // Only Spouse A's proposed certificate (75000) is calculated; the 20000
    // from the discussion-only document is excluded.
    expect(JSON.parse(resCalcShared.payload).grossIncome).toBe(75000);
  });

  it('Step 3c: a private fact never leaks through the activity feed and stays private when its document is deleted', async () => {
    // Spouse A keeps a second salary certificate private and confirms a figure
    // from it. The body asks for inclusion, sharing and a different owner; the
    // API must force all three back to the private-draft rule (M1).
    const privateCertificate = `
      CERTIFICAT DE REMUNERATION 2025
      Employeur: Banque Privee S.A.
      Salarie: Jean Weber
      Code 101 - Remuneration brute: 97531.42 EUR
      Code 103 - Cotisations de securite sociale: 12000.00 EUR
      Code 105 - Retenue d'impot: 8000.00 EUR
    `;

    const resUploadPrivate = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/documents`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        fileName: 'private_salary_memo.txt',
        fileContentBase64: Buffer.from(privateCertificate).toString('base64'),
        mimeType: 'text/plain',
      },
    });
    expect(resUploadPrivate.statusCode).toBe(201);
    const privateDoc = JSON.parse(resUploadPrivate.payload);
    expect(privateDoc.visibility).toBe(DocumentVisibility.PRIVATE_DRAFT);
    expect(privateDoc.ownerId).toBe(userAId);

    const resPrivateFacts = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/facts`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(resPrivateFacts.statusCode).toBe(200);
    const privateExtracted = JSON.parse(resPrivateFacts.payload).extractedFacts.find(
      (f: any) => f.documentId === privateDoc.id,
    );
    expect(privateExtracted).toBeDefined();

    const PRIVATE_FIELD_KEY = 'privateSalaryMemo';
    const PRIVATE_AMOUNT = '97531.42';
    const UPDATED_PRIVATE_AMOUNT = '86420.11';

    const resConfirmPrivate = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/facts/confirm`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        extractedFactId: privateExtracted.id,
        category: FactCategory.EMPLOYMENT_INCOME,
        fieldKey: PRIVATE_FIELD_KEY,
        amount: PRIVATE_AMOUNT,
        isIncludedInReturn: true,
        isSharedWithHousehold: true,
        ownerId: userBId,
      },
    });
    expect(resConfirmPrivate.statusCode).toBe(201);
    const privateFact = JSON.parse(resConfirmPrivate.payload);
    // M1: a private-draft fact is never shared, never included and never
    // re-attributed, even when the request body asks for it.
    expect(privateFact.ownerId).toBe(userAId);
    expect(privateFact.isSharedWithHousehold).toBe(false);
    expect(privateFact.isIncludedInReturn).toBe(false);

    const readActivity = async (token: string) => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/households/${householdId}/activity?limit=100`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      return { payload: res.payload, events: JSON.parse(res.payload) };
    };

    // B1: spouse B may see that an event happened, but not its field key or
    // amount.
    const activityAfterConfirm = await readActivity(tokenB);
    expect(activityAfterConfirm.payload).not.toContain(PRIVATE_FIELD_KEY);
    expect(activityAfterConfirm.payload).not.toContain(PRIVATE_AMOUNT);
    const confirmEvent = activityAfterConfirm.events.find(
      (e: any) =>
        e.entityType === 'ConfirmedFact' && e.entityId === privateFact.id,
    );
    expect(confirmEvent).toBeDefined();
    expect(confirmEvent.description).toBe('Confirmed a private fact (details hidden)');
    expect(confirmEvent.newValue.fieldKey).toBeUndefined();
    expect(confirmEvent.newValue.amount).toBeUndefined();
    expect(confirmEvent.newValue.category).toBe(FactCategory.EMPLOYMENT_INCOME);

    // M3: the spouse cannot destroy a private fact with a guessed id.
    const resDeleteByB = await app.inject({
      method: 'DELETE',
      url: `/api/workspaces/${workspaceId}/facts/${privateFact.id}`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(resDeleteByB.statusCode).toBe(403);

    // B1: updating the private amount must not publish the old or the new value.
    const resUpdatePrivate = await app.inject({
      method: 'PATCH',
      url: `/api/workspaces/${workspaceId}/facts/${privateFact.id}`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { amount: UPDATED_PRIVATE_AMOUNT },
    });
    expect(resUpdatePrivate.statusCode).toBe(200);
    const activityAfterUpdate = await readActivity(tokenB);
    expect(activityAfterUpdate.payload).not.toContain(PRIVATE_AMOUNT);
    expect(activityAfterUpdate.payload).not.toContain(UPDATED_PRIVATE_AMOUNT);
    expect(activityAfterUpdate.payload).not.toContain(PRIVATE_FIELD_KEY);

    // M1: deleting the private source document nulls sourceDocumentId. The fact
    // must stay private to A instead of becoming a shared manual fact.
    const resDeletePrivateDoc = await app.inject({
      method: 'DELETE',
      url: `/api/workspaces/${workspaceId}/documents/${privateDoc.id}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(resDeletePrivateDoc.statusCode).toBe(200);

    const factsForBAfterDelete = JSON.parse(
      (
        await app.inject({
          method: 'GET',
          url: `/api/workspaces/${workspaceId}/facts`,
          headers: { authorization: `Bearer ${tokenB}` },
        })
      ).payload,
    );
    expect(
      factsForBAfterDelete.confirmedFacts.some(
        (f: any) => f.id === privateFact.id,
      ),
    ).toBe(false);

    const factsForAAfterDelete = JSON.parse(
      (
        await app.inject({
          method: 'GET',
          url: `/api/workspaces/${workspaceId}/facts`,
          headers: { authorization: `Bearer ${tokenA}` },
        })
      ).payload,
    );
    const orphanedFact = factsForAAfterDelete.confirmedFacts.find(
      (f: any) => f.id === privateFact.id,
    );
    expect(orphanedFact).toBeDefined();
    expect(orphanedFact.sourceDocumentId).toBeNull();
    expect(orphanedFact.isSharedWithHousehold).toBe(false);
    expect(orphanedFact.isIncludedInReturn).toBe(false);

    const resUpdateOrphanByB = await app.inject({
      method: 'PATCH',
      url: `/api/workspaces/${workspaceId}/facts/${privateFact.id}`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { amount: '1.00' },
    });
    expect(resUpdateOrphanByB.statusCode).toBe(403);

    // B1: deleting the private fact logs a redacted event only.
    const resDeletePrivate = await app.inject({
      method: 'DELETE',
      url: `/api/workspaces/${workspaceId}/facts/${privateFact.id}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(resDeletePrivate.statusCode).toBe(200);

    const activityAfterDeleteFact = await readActivity(tokenB);
    expect(activityAfterDeleteFact.payload).not.toContain(PRIVATE_AMOUNT);
    expect(activityAfterDeleteFact.payload).not.toContain(UPDATED_PRIVATE_AMOUNT);
    expect(activityAfterDeleteFact.payload).not.toContain(PRIVATE_FIELD_KEY);
    const factEvents = activityAfterDeleteFact.events.filter(
      (e: any) =>
        e.entityType === 'ConfirmedFact' && e.entityId === privateFact.id,
    );
    expect(factEvents.length).toBeGreaterThanOrEqual(3);
    expect(
      factEvents.some(
        (e: any) => e.description === 'Updated a private fact (details hidden)',
      ),
    ).toBe(true);
    expect(
      factEvents.some(
        (e: any) => e.description === 'Deleted a private fact (details hidden)',
      ),
    ).toBe(true);
    for (const event of factEvents) {
      expect(JSON.stringify(event)).not.toContain(PRIVATE_AMOUNT);
      expect(JSON.stringify(event)).not.toContain(UPDATED_PRIVATE_AMOUNT);
      expect(JSON.stringify(event)).not.toContain(PRIVATE_FIELD_KEY);
    }
  });

  it('Step 4: Deterministic calculation and dual-spouse approval', async () => {
    // Calculate Tax
    const resCalc = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/calculate`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(resCalc.statusCode).toBe(201);
    const calc = JSON.parse(resCalc.payload);
    expect(calc.taxYear).toBe(2025);
    expect(calc.taxClass).toBe(TaxClass.CLASS_2); // Joint married
    expect(calc.grossIncome).toBe(75000);
    expect(calc.taxableIncome).toBeGreaterThan(0);
    expect(calc.provenance.length).toBeGreaterThan(3);

    // Spouse A Approves Return -> status should be HOUSEHOLD_REVIEW (awaiting Spouse B)
    const resApproveA = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/approve`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(resApproveA.statusCode).toBe(201);
    const retA = JSON.parse(resApproveA.payload);
    expect(retA.bothSpousesApproved).toBe(false);

    // Spouse B Approves Return -> status should now become APPROVED
    const resApproveB = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/approve`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(resApproveB.statusCode).toBe(201);
    const retB = JSON.parse(resApproveB.payload);
    expect(retB.bothSpousesApproved).toBe(true);
  });

  it('Step 5: Invalidation test - modifying a fact invalidates prior approvals', async () => {
    // Spouse A updates the gross salary fact amount
    const resEdit = await app.inject({
      method: 'PATCH',
      url: `/api/workspaces/${workspaceId}/facts/${salaryFactId}`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        amount: '80000.00',
      },
    });
    expect(resEdit.statusCode).toBe(200);

    // Verify workspace status reverted to NEEDS_REVIEW
    const resWs = await app.inject({
      method: 'GET',
      url: `/api/households/${householdId}/workspaces/2025`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(resWs.statusCode).toBe(200);
    expect(JSON.parse(resWs.payload).status).toBe(WorkspaceStatus.NEEDS_REVIEW);

    // Verify audit event emitted
    const resAudit = await app.inject({
      method: 'GET',
      url: `/api/households/${householdId}/activity?eventType=${AuditEventType.APPROVAL_INVALIDATED}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(resAudit.statusCode).toBe(200);
    const auditLogs = JSON.parse(resAudit.payload);
    expect(auditLogs.length).toBeGreaterThanOrEqual(1);
    expect(auditLogs[0].description).toContain('Approvals invalidated');
  });

  it('Step 6: Re-calculate, re-approve, generate Filing Package, import Assessment, and Roll Over to 2026', async () => {
    // Re-calculate
    await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/calculate`,
      headers: { authorization: `Bearer ${tokenA}` },
    });

    // Re-approve by both
    await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/approve`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/approve`,
      headers: { authorization: `Bearer ${tokenB}` },
    });

    // Generate Filing Package
    const resPkg = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/filing-package`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(resPkg.statusCode).toBe(201);
    const pkg = JSON.parse(resPkg.payload);
    expect(pkg.form100Boxes.length).toBeGreaterThan(0);
    // The guide grew to five sections when the filing record and assessment
    // steps were added; asserting 4 pinned the pre-API-6 shape.
    expect(pkg.myGuichetGuide.length).toBeGreaterThanOrEqual(5);
    expect(pkg.packageSha256).toBeDefined();

    // Import ACD Tax Assessment (Bulletin d'imposition)
    const resAss = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/assessment`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        taxYear: 2025,
        bulletinDate: '2026-08-15',
        assessedTaxableIncome: '70000.00',
        assessedTaxDue: '11800.00',
      },
    });
    expect(resAss.statusCode).toBe(201);
    const ass = JSON.parse(resAss.payload);
    expect(ass.assessedTaxDue).toBe(11800);
    expect(ass.differenceWithDeclared).toBeDefined();

    // Rollover to 2026
    const resRoll = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/rollover`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(resRoll.statusCode).toBe(201);
    const roll = JSON.parse(resRoll.payload);
    expect(roll.nextTaxYear).toBe(2026);
    expect(roll.nextWorkspaceId).toBeDefined();

    // Verify 2026 workspace exists
    const resWs2026 = await app.inject({
      method: 'GET',
      url: `/api/households/${householdId}/workspaces/2026`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(resWs2026.statusCode).toBe(200);
    expect(JSON.parse(resWs2026.payload).taxYear).toBe(2026);
  });
});
