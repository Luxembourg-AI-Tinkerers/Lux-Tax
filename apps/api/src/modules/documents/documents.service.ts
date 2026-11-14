import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  DocumentVisibility,
  DocumentType,
  DocumentStatus,
  AuditEventType,
  DocumentDto,
  MembershipStatus,
  NotificationSeverity,
  NotificationType,
} from '@luxtax/contracts';
import { NotificationsService } from '../notifications/notifications.service';
import { UploadDocumentInput } from '@luxtax/validation';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import { ReceiptAiVisionService } from './receipt-ai-vision.service';
import { ReturnApprovalsService } from '../filing/return-approvals.service';
import { assertDeclaredMimeMatches, decodeBase64Upload } from './upload-guard';

/** The upload cap enforced below, re-exported so callers can document it. */
export { MAX_UPLOAD_BYTES } from './upload-guard';

@Injectable()
export class DocumentsService {
  private readonly uploadDir = path.resolve(process.cwd(), 'uploads');

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly receiptAiVisionService: ReceiptAiVisionService,
    private readonly returnApprovals: ReturnApprovalsService,
    private readonly notifications: NotificationsService,
  ) {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async uploadDocument(
    workspaceId: string,
    uploaderId: string,
    input: UploadDocumentInput,
    ipAddress?: string,
  ): Promise<DocumentDto> {
    const workspace = await this.prisma.taxYearWorkspace.findUnique({
      where: { id: workspaceId },
      include: { household: true },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    // A document always starts as a private draft. It may be attributed to the
    // uploader or to another active member of the same household (upload on
    // behalf of a spouse), but never to an arbitrary user id. Visibility is
    // changed afterwards through the audited endpoint, so a crafted upload body
    // cannot create a shared document.
    if (input.ownerId && input.ownerId !== uploaderId) {
      const ownerMembership = await this.prisma.householdMembership.findUnique({
        where: {
          householdId_userId: {
            householdId: workspace.householdId,
            userId: input.ownerId,
          },
        },
      });

      if (!ownerMembership || ownerMembership.status !== MembershipStatus.ACTIVE) {
        throw new BadRequestException(
          'Document owner must be the uploader or an active member of this household',
        );
      }
    }
    if (input.visibility && input.visibility !== DocumentVisibility.PRIVATE_DRAFT) {
      throw new BadRequestException(
        'Documents must be uploaded as PRIVATE_DRAFT; change visibility after upload',
      );
    }

    // Uploading for a spouse attributes the document and the facts the parser
    // extracts from it to that spouse, so the record stays consistent.
    const documentOwnerId = input.ownerId ?? uploaderId;

    // 1. Decode and verify the payload before it costs anything. An oversized
    // body, a string that is not base64, or bytes that contradict the declared
    // MIME type must not reach the hash check, the disk, or the AI model.
    const fileBuffer = decodeBase64Upload(input.fileContentBase64);
    assertDeclaredMimeMatches(input.mimeType, fileBuffer);
    const sha256Hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // 2. Check for duplicate document in this workspace
    const existingDoc = await this.prisma.document.findFirst({
      where: {
        workspaceId,
        sha256Hash,
      },
    });

    if (existingDoc) {
      throw new BadRequestException('Duplicate document: this file has already been uploaded to this workspace');
    }

    // 3. Save file locally
    const workspaceUploadDir = path.join(this.uploadDir, workspaceId);
    if (!fs.existsSync(workspaceUploadDir)) {
      fs.mkdirSync(workspaceUploadDir, { recursive: true });
    }
    const safeFileName = `${sha256Hash.substring(0, 12)}_${path.basename(input.fileName)}`;
    const storagePath = path.join(workspaceUploadDir, safeFileName);
    fs.writeFileSync(storagePath, fileBuffer);

    // 4. Read the document: text layer → parser, image → OCR model, or neither.
    // The third outcome is a first-class state, not an empty fact list.
    const extractionResult = await this.receiptAiVisionService.processReceiptOrDocument(
      fileBuffer,
      input.fileName,
      input.mimeType,
      input.documentType ?? null,
    );

    const finalDocType = (input.documentType && input.documentType !== DocumentType.UNKNOWN)
      ? input.documentType
      : extractionResult.documentType;

    // 5. Create Document record
    const document = await this.prisma.document.create({
      data: {
        workspaceId,
        uploaderId,
        ownerId: documentOwnerId,
        fileName: safeFileName,
        originalName: input.fileName,
        mimeType: input.mimeType,
        fileSize: fileBuffer.length,
        sha256Hash,
        storagePath,
        documentType: finalDocType,
        status: extractionResult.needsOcr ? DocumentStatus.NEEDS_OCR : DocumentStatus.EXTRACTED,
        visibility: DocumentVisibility.PRIVATE_DRAFT,
        pageCount: extractionResult.pageCount > 0 ? extractionResult.pageCount : 1,
        extractionSource: extractionResult.source,
        ocrRequired: extractionResult.needsOcr,
      },
      include: {
        owner: { select: { email: true } },
      },
    });

    // 6. Create DocumentExtraction record. `rawJson` keeps the fields for the
    // UI and the provenance for an auditor: which reader ran, and why it found
    // nothing when it found nothing.
    await this.prisma.documentExtraction.create({
      data: {
        documentId: document.id,
        extractedText: extractionResult.extractedSnippet || null,
        confidence: extractionResult.confidence,
        rawJson: {
          fields: extractionResult.fields,
          source: extractionResult.source,
          modelUsed: extractionResult.modelUsed,
          reason: extractionResult.reason,
          rejectedFields: extractionResult.rejectedFields,
          textCharacters: extractionResult.textCharacters,
        } as any,
      },
    });

    // 7. Create ExtractedFact records
    for (const field of extractionResult.fields) {
      await this.prisma.extractedFact.create({
        data: {
          documentId: document.id,
          workspaceId,
          ownerId: documentOwnerId,
          fieldName: field.name,
          fieldValue: field.value,
          currency: 'EUR',
          confidence: field.confidence,
          sourcePage: 1,
          sourceSnippet: field.snippet,
        },
      });
    }

    // 8. Record audit event
    await this.auditService.logEvent({
      householdId: workspace.householdId,
      workspaceId,
      actorId: uploaderId,
      eventType: AuditEventType.DOCUMENT_UPLOADED,
      entityType: 'Document',
      entityId: document.id,
      newValue: {
        fileName: document.originalName,
        documentType: document.documentType,
        visibility: document.visibility,
        sha256Hash: document.sha256Hash,
      },
      description: `Uploaded document "${document.originalName}" classified as ${document.documentType}`,
      ipAddress,
    });

    return {
      id: document.id,
      workspaceId: document.workspaceId,
      uploaderId: document.uploaderId,
      ownerId: document.ownerId,
      ownerEmail: document.owner?.email || null,
      fileName: document.fileName,
      originalName: document.originalName,
      mimeType: document.mimeType,
      fileSize: document.fileSize,
      sha256Hash: document.sha256Hash,
      documentType: document.documentType as DocumentType,
      status: document.status as DocumentStatus,
      visibility: document.visibility as DocumentVisibility,
      pageCount: document.pageCount,
      taxYear: workspace.taxYear,
      extractedFactsCount: extractionResult.fields.length,
      ocrRequired: extractionResult.needsOcr,
      extractionSource: extractionResult.source,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
    };
  }

  async getDocumentsForWorkspace(
    workspaceId: string,
    currentUserId: string,
  ): Promise<DocumentDto[]> {
    const workspace = await this.prisma.taxYearWorkspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const docs = await this.prisma.document.findMany({
      where: {
        workspaceId,
        OR: [
          { uploaderId: currentUserId },
          { ownerId: currentUserId },
          {
            visibility: {
              in: [
                DocumentVisibility.SHARED_FOR_DISCUSSION,
                DocumentVisibility.PROPOSED_FOR_RETURN,
                DocumentVisibility.INCLUDED_IN_RETURN,
              ],
            },
          },
        ],
      },
      include: {
        owner: { select: { email: true } },
        _count: {
          select: { extractedFacts: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return docs.map((doc) => ({
      id: doc.id,
      workspaceId: doc.workspaceId,
      uploaderId: doc.uploaderId,
      ownerId: doc.ownerId,
      ownerEmail: doc.owner?.email || null,
      fileName: doc.fileName,
      originalName: doc.originalName,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize,
      sha256Hash: doc.sha256Hash,
      documentType: doc.documentType as DocumentType,
      status: doc.status as DocumentStatus,
      visibility: doc.visibility as DocumentVisibility,
      pageCount: doc.pageCount,
      taxYear: workspace.taxYear,
      extractedFactsCount: doc._count.extractedFacts,
      ocrRequired: doc.ocrRequired,
      extractionSource: doc.extractionSource,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    }));
  }

  /**
   * Reads a stored document again.
   *
   * Two situations need this: an OCR model was activated after the file was
   * uploaded, and a first read produced nothing usable. Confirmed figures are
   * never touched — they are the user's data, and replacing them silently would
   * be a different feature with a different consent. Only the unconfirmed
   * candidates are replaced, and the event is audited because the figures the
   * user is shown change without a new upload.
   */
  async reextractDocument(
    workspaceId: string,
    documentId: string,
    userId: string,
    ipAddress?: string,
  ): Promise<DocumentDto> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { workspace: true },
    });

    if (!document || document.workspaceId !== workspaceId) {
      throw new NotFoundException('Document not found in workspace');
    }

    // The path is written by the upload handler from a hash, never by a client,
    // but resolving it inside the upload directory keeps a corrupted row from
    // turning this endpoint into an arbitrary file reader.
    const resolvedPath = path.resolve(document.storagePath);
    const uploadRoot = path.resolve(this.uploadDir) + path.sep;
    if (!resolvedPath.startsWith(uploadRoot) || !fs.existsSync(resolvedPath)) {
      throw new NotFoundException('The stored file is no longer available');
    }

    const fileBuffer = fs.readFileSync(resolvedPath);
    const extraction = await this.receiptAiVisionService.processReceiptOrDocument(
      fileBuffer,
      document.originalName,
      document.mimeType,
      null,
    );

    // A figure the user already confirmed must not come back as a candidate: the
    // engine sums confirmed facts, so confirming it twice would double the income
    // or the deduction. Re-reading therefore only fills what is still missing.
    const alreadyConfirmed = new Set(
      (
        await this.prisma.confirmedFact.findMany({
          where: { sourceDocumentId: document.id },
          select: { fieldKey: true },
        })
      ).map((fact) => fact.fieldKey),
    );
    const candidates = extraction.fields.filter((field) => !alreadyConfirmed.has(field.name));

    const extractedFactsCount = await this.prisma.$transaction(async (transaction) => {
      // Only candidates: a confirmed fact keeps its provenance link and its amount.
      await transaction.extractedFact.deleteMany({
        where: { documentId: document.id, isConfirmed: false },
      });

      for (const field of candidates) {
        await transaction.extractedFact.create({
          data: {
            documentId: document.id,
            workspaceId,
            ownerId: document.ownerId ?? document.uploaderId,
            fieldName: field.name,
            fieldValue: field.value,
            currency: 'EUR',
            confidence: field.confidence,
            sourcePage: 1,
            sourceSnippet: field.snippet,
          },
        });
      }

      await transaction.document.update({
        where: { id: document.id },
        data: {
          documentType:
            extraction.documentType !== DocumentType.UNKNOWN ? extraction.documentType : document.documentType,
          status: extraction.needsOcr ? DocumentStatus.NEEDS_OCR : DocumentStatus.EXTRACTED,
          pageCount: extraction.pageCount > 0 ? extraction.pageCount : document.pageCount,
          extractionSource: extraction.source,
          ocrRequired: extraction.needsOcr,
        },
      });

      await transaction.documentExtraction.create({
        data: {
          documentId: document.id,
          extractedText: extraction.extractedSnippet || null,
          confidence: extraction.confidence,
          rawJson: {
            fields: extraction.fields,
            source: extraction.source,
            modelUsed: extraction.modelUsed,
            reason: extraction.reason,
            rejectedFields: extraction.rejectedFields,
            textCharacters: extraction.textCharacters,
            alreadyConfirmed: [...alreadyConfirmed],
            reextraction: true,
          } as any,
        },
      });

      return candidates.length;
    });

    await this.auditService.logEvent({
      householdId: document.workspace.householdId,
      workspaceId,
      actorId: userId,
      eventType: AuditEventType.DOCUMENT_REEXTRACTED,
      entityType: 'Document',
      entityId: document.id,
      newValue: {
        documentType: extraction.documentType,
        source: extraction.source,
        ocrRequired: extraction.needsOcr,
        factsReplaced: extractedFactsCount,
      },
      description: `Re-read "${document.originalName}" (${extraction.source}); ${extractedFactsCount} candidate figure(s) replaced`,
      ipAddress,
    });

    const refreshed = await this.prisma.document.findUniqueOrThrow({
      where: { id: document.id },
      include: { owner: { select: { email: true } } },
    });

    return {
      id: refreshed.id,
      workspaceId: refreshed.workspaceId,
      uploaderId: refreshed.uploaderId,
      ownerId: refreshed.ownerId,
      ownerEmail: refreshed.owner?.email || null,
      fileName: refreshed.fileName,
      originalName: refreshed.originalName,
      mimeType: refreshed.mimeType,
      fileSize: refreshed.fileSize,
      sha256Hash: refreshed.sha256Hash,
      documentType: refreshed.documentType as DocumentType,
      status: refreshed.status as DocumentStatus,
      visibility: refreshed.visibility as DocumentVisibility,
      pageCount: refreshed.pageCount,
      taxYear: document.workspace.taxYear,
      extractedFactsCount,
      ocrRequired: extraction.needsOcr,
      extractionSource: extraction.source,
      createdAt: refreshed.createdAt.toISOString(),
      updatedAt: refreshed.updatedAt.toISOString(),
    };
  }

  async updateVisibility(
    workspaceId: string,
    documentId: string,
    userId: string,
    visibility: DocumentVisibility,
    ipAddress?: string,
  ): Promise<DocumentDto> {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { workspace: true },
    });

    if (!doc || doc.workspaceId !== workspaceId) {
      throw new NotFoundException('Document not found in workspace');
    }

    if (doc.uploaderId !== userId && doc.ownerId !== userId) {
      throw new ForbiddenException('Only uploader or owner can change document visibility');
    }

    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: { visibility },
    });

    await this.auditService.logEvent({
      householdId: doc.workspace.householdId,
      workspaceId,
      actorId: userId,
      eventType: AuditEventType.FACT_UPDATED,
      entityType: 'Document',
      entityId: documentId,
      previousValue: { visibility: doc.visibility },
      newValue: { visibility },
      description: `Changed visibility of "${doc.originalName}" to ${visibility}`,
      ipAddress,
    });

    // Moving a document into (or out of) the return changes what the return
    // contains, so a standing approval no longer covers it. The reason stays
    // generic: the audit feed is household-readable and must not carry the
    // name of a private file. No-op when nobody approved yet.
    await this.returnApprovals.invalidateForChange(
      workspaceId,
      userId,
      'Document visibility changed',
      ipAddress,
    );

    // A shared document asks the other filers to confirm its extracted facts.
    // A private draft notifies nobody; the actor already knows.
    if (
      visibility === DocumentVisibility.SHARED_FOR_DISCUSSION ||
      visibility === DocumentVisibility.PROPOSED_FOR_RETURN
    ) {
      try {
        await this.notifications.emitToHousehold({
          householdId: doc.workspace.householdId,
          workspaceId,
          actorId: userId,
          excludeUserIds: [userId],
          dedupeKey: `document-shared:${documentId}:${visibility}`,
          type: NotificationType.DOCUMENT_CONFIRMATION_REQUIRED,
          severity: NotificationSeverity.INFO,
          title: 'Document shared — facts need confirmation',
          body: 'A household member shared a document. Review its extracted facts before they enter the return.',
          entityType: 'Document',
          entityId: documentId,
        });
      } catch {
        // A notification failure must not undo the visibility change.
      }
    }

    return {
      id: updated.id,
      workspaceId: updated.workspaceId,
      uploaderId: updated.uploaderId,
      ownerId: updated.ownerId,
      fileName: updated.fileName,
      originalName: updated.originalName,
      mimeType: updated.mimeType,
      fileSize: updated.fileSize,
      sha256Hash: updated.sha256Hash,
      documentType: updated.documentType as DocumentType,
      status: updated.status as DocumentStatus,
      visibility: updated.visibility as DocumentVisibility,
      pageCount: updated.pageCount,
      taxYear: doc.workspace.taxYear,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async deleteDocument(
    workspaceId: string,
    documentId: string,
    userId: string,
    ipAddress?: string,
  ): Promise<void> {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { workspace: true },
    });

    if (!doc || doc.workspaceId !== workspaceId) {
      throw new NotFoundException('Document not found');
    }

    if (doc.uploaderId !== userId && doc.ownerId !== userId) {
      throw new ForbiddenException('Only uploader or owner can delete this document');
    }

    await this.prisma.document.delete({
      where: { id: documentId },
    });

    try {
      if (fs.existsSync(doc.storagePath)) {
        fs.unlinkSync(doc.storagePath);
      }
    } catch {
      // safe ignore disk cleanup error
    }

    await this.auditService.logEvent({
      householdId: doc.workspace.householdId,
      workspaceId,
      actorId: userId,
      eventType: AuditEventType.DOCUMENT_DELETED,
      entityType: 'Document',
      entityId: documentId,
      description: `Deleted document "${doc.originalName}"`,
      ipAddress,
    });

    // A deleted document may have carried facts into the return; supersede any
    // approval. Reason is generic on purpose — never the deleted file name.
    await this.returnApprovals.invalidateForChange(
      workspaceId,
      userId,
      'Document deleted',
      ipAddress,
    );
  }

  /**
   * Deterministic tax document parser for Luxembourg certificates.
   */
  private extractFromText(rawText: string, fileName: string): {
    documentType: DocumentType;
    confidence: number;
    extractedSnippet: string;
    fields: Array<{ name: string; value: string; confidence: number; snippet: string }>;
  } {
    const textLower = (rawText + ' ' + fileName).toLowerCase();
    const fields: Array<{ name: string; value: string; confidence: number; snippet: string }> = [];

    // Check for Certificat de Rémunération (Salary certificate)
    if (
      textLower.includes('certificat de rémunération') ||
      textLower.includes('certificat de salaire') ||
      textLower.includes('salary') ||
      textLower.includes('rémunération') ||
      textLower.includes('code 101') ||
      textLower.includes('code 102')
    ) {
      // Extract gross salary (Code 101/102 or gross)
      const grossMatch =
        rawText.match(/(?:code\s*10[12]|brut|gross|rémunération\s*brute)[^\d]*([\d.,]+)/i) ||
        rawText.match(/([\d]+[.,][\d]{2})/);
      if (grossMatch) {
        const val = this.normalizeAmount(grossMatch[1]);
        fields.push({
          name: 'grossSalary',
          value: val,
          confidence: 0.95,
          snippet: grossMatch[0],
        });
      }

      // Extract social security (Code 103)
      const socialMatch = rawText.match(/(?:code\s*103|sécurité\s*sociale|cotisations)[^\d]*([\d.,]+)/i);
      if (socialMatch) {
        fields.push({
          name: 'socialSecurity',
          value: this.normalizeAmount(socialMatch[1]),
          confidence: 0.95,
          snippet: socialMatch[0],
        });
      }

      // Extract withholding tax (Code 105)
      const taxMatch = rawText.match(/(?:code\s*105|retenue\s*d['’]impôt|withholding)[^\d]*([\d.,]+)/i);
      if (taxMatch) {
        fields.push({
          name: 'withholdingTax',
          value: this.normalizeAmount(taxMatch[1]),
          confidence: 0.95,
          snippet: taxMatch[0],
        });
      }

      return {
        documentType: DocumentType.SALARY_CERTIFICATE,
        confidence: 0.95,
        extractedSnippet: rawText.substring(0, 300),
        fields,
      };
    }

    // Check for Mortgage certificate (Attestation d'intérêts débiteurs)
    if (
      textLower.includes('intérêts débiteurs') ||
      textLower.includes('prêt immobilier') ||
      textLower.includes('mortgage') ||
      textLower.includes('emprunt')
    ) {
      const match = rawText.match(/(?:intérêts|total|montant)[^\d]*([\d.,]+)/i);
      if (match) {
        fields.push({
          name: 'mortgageInterest',
          value: this.normalizeAmount(match[1]),
          confidence: 0.90,
          snippet: match[0],
        });
      }

      return {
        documentType: DocumentType.MORTGAGE_CERTIFICATE,
        confidence: 0.90,
        extractedSnippet: rawText.substring(0, 300),
        fields,
      };
    }

    // Check for Insurance (Attestation d'assurance Art 111)
    if (textLower.includes('assurance') || textLower.includes('prévoyance') || textLower.includes('art 111')) {
      const match = rawText.match(/(?:prime|montant|cotisation)[^\d]*([\d.,]+)/i);
      if (match) {
        fields.push({
          name: 'insurancePremium',
          value: this.normalizeAmount(match[1]),
          confidence: 0.90,
          snippet: match[0],
        });
      }

      return {
        documentType: DocumentType.INSURANCE_CERTIFICATE,
        confidence: 0.88,
        extractedSnippet: rawText.substring(0, 300),
        fields,
      };
    }

    // Check for Donation (Certificat de don Art 112)
    if (textLower.includes('don') || textLower.includes('libéralité') || textLower.includes('donation')) {
      const match = rawText.match(/(?:montant|don|somme)[^\d]*([\d.,]+)/i);
      if (match) {
        fields.push({
          name: 'donationAmount',
          value: this.normalizeAmount(match[1]),
          confidence: 0.92,
          snippet: match[0],
        });
      }

      return {
        documentType: DocumentType.DONATION_CERTIFICATE,
        confidence: 0.92,
        extractedSnippet: rawText.substring(0, 300),
        fields,
      };
    }

    return {
      documentType: DocumentType.UNKNOWN,
      confidence: 0.5,
      extractedSnippet: rawText.substring(0, 300),
      fields: [],
    };
  }

  private normalizeAmount(raw: string): string {
    // Replaces thousand separators and standardizes comma/point
    const clean = raw.replace(/\s/g, '').replace(/,/g, '.');
    const num = parseFloat(clean);
    return isNaN(num) ? '0.00' : num.toFixed(2);
  }
}
