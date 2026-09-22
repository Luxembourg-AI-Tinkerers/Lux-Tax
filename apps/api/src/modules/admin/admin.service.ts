import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AdminOverviewDto,
  TaxRulePackageDto,
  FormMappingDto,
  ModelDefinitionDto,
  ModelRouteDto,
  EvaluationRunDto,
  AuditEventDto,
  AuditEventType,
} from '@luxtax/contracts';
import * as crypto from 'crypto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(): Promise<AdminOverviewDto> {
    const [workspacesCount, auditCount] = await Promise.all([
      this.prisma.taxYearWorkspace.count(),
      this.prisma.auditEvent.count(),
    ]);

    return {
      serviceHealth: 'HEALTHY',
      activeTaxYears: [2025],
      registeredModelsCount: 4,
      activeRoutesCount: 5,
      totalWorkspaces: workspacesCount,
      totalAuditEvents: auditCount,
    };
  }

  getTaxRules(): readonly TaxRulePackageDto[] {
    const rulesJson = JSON.stringify({
      taxYear: 2025,
      brackets: 23,
      splittingMethod: true,
      standardDeductions: { frais: 540, mortgageCap: 4000, specialExpenses: 960 },
    });
    const packageChecksum = crypto.createHash('sha256').update(rulesJson).digest('hex');

    return [
      {
        id: 'pkg-lux-2025-v1',
        taxYear: 2025,
        version: '2025.1.0',
        effectiveDate: '2025-01-01',
        progressiveScaleBrackets: 23,
        splittingMethodEnabled: true,
        standardDeductionFrais: '540.00',
        primaryResidenceMortgageCap: '4000.00',
        specialExpensesForfait: '960.00',
        legalSourceUrls: [
          'https://impotsdirects.public.lu/fr/baremes.html',
          'https://legilux.public.lu/eli/etat/leg/loi/1967/12/04/n1/jo',
        ],
        packageChecksum,
        status: 'ACTIVE',
      },
    ];
  }

  getForms(): readonly FormMappingDto[] {
    return [
      {
        id: 'form-100-2025',
        formCode: 'FORM_100',
        taxYear: 2025,
        version: '2025-REV1',
        boxMappings: [
          { boxNumber: '101', fieldName: 'GROSS_SALARY_PRIMARY', description: 'Gross Salary - Primary Taxpayer' },
          { boxNumber: '102', fieldName: 'GROSS_SALARY_SPOUSE', description: 'Gross Salary - Spouse' },
          { boxNumber: '103', fieldName: 'SOCIAL_CONTRIBUTIONS', description: 'Social Security Contributions' },
          { boxNumber: '105', fieldName: 'WITHHOLDING_TAX_PAID', description: 'Tax Withheld at Source' },
          { boxNumber: '301', fieldName: 'MORTGAGE_INTEREST_PRIMARY_RESIDENCE', description: 'Deductible Mortgage Interest' },
          { boxNumber: '305', fieldName: 'LIFE_INSURANCE_PREMIUMS', description: 'Art. 111 Life & Disability Insurance' },
          { boxNumber: '310', fieldName: 'CHARITABLE_DONATIONS', description: 'Art. 112 Recognized Charitable Donations' },
        ],
      },
    ];
  }

  getModels(): readonly ModelDefinitionDto[] {
    return [
      {
        id: 'mdl-docling-v2',
        displayName: 'Docling Document Parser',
        providerType: 'LOCAL',
        modelIdentifier: 'docling-parser-v2.1',
        capabilities: ['TEXT'],
        permittedDataClass: 'CUSTOMER_DOCUMENT',
        hostingRegion: 'EU_LOCAL',
        status: 'ACTIVE',
        healthy: true,
      },
      {
        id: 'mdl-paddle-v3',
        displayName: 'PaddleOCR Layout & Scans',
        providerType: 'LOCAL',
        modelIdentifier: 'pp-structure-v3',
        capabilities: ['TEXT', 'VISION'],
        permittedDataClass: 'CUSTOMER_DOCUMENT',
        hostingRegion: 'EU_LOCAL',
        status: 'ACTIVE',
        healthy: true,
      },
      {
        id: 'mdl-qwen35-4b',
        displayName: 'Qwen3.5-4B Narrow Field Extractor',
        providerType: 'LOCAL',
        modelIdentifier: 'qwen3.5-4b-instruct-q4',
        capabilities: ['TEXT'],
        permittedDataClass: 'REDACTED_CUSTOMER',
        hostingRegion: 'EU_LOCAL',
        status: 'ACTIVE',
        healthy: true,
      },
      {
        id: 'mdl-qwen3-vl-4b',
        displayName: 'Qwen3-VL-4B Vision Specialist',
        providerType: 'PRIVATE_CLOUD',
        modelIdentifier: 'qwen3-vl-4b-instruct',
        capabilities: ['VISION'],
        permittedDataClass: 'CUSTOMER_DOCUMENT',
        hostingRegion: 'EU_WEST',
        status: 'ACTIVE',
        healthy: true,
      },
    ];
  }

  getModelRoutes(): readonly ModelRouteDto[] {
    return [
      {
        id: 'route-salary-cert',
        taskName: 'document.extract.salary_certificate',
        primaryModelId: 'mdl-docling-v2',
        fallbackModelIds: ['mdl-qwen35-4b'],
        promptVersion: 'salary-cert-v2.0',
        outputSchemaVersion: 'schema-salary-v1',
        timeoutMs: 8000,
        maxDataClass: 'CUSTOMER_DOCUMENT',
        activeRolloutPercentage: 100,
      },
      {
        id: 'route-mortgage-interest',
        taskName: 'document.extract.mortgage_certificate',
        primaryModelId: 'mdl-docling-v2',
        fallbackModelIds: ['mdl-qwen35-4b'],
        promptVersion: 'mortgage-cert-v1.4',
        outputSchemaVersion: 'schema-mortgage-v1',
        timeoutMs: 8000,
        maxDataClass: 'CUSTOMER_DOCUMENT',
        activeRolloutPercentage: 100,
      },
      {
        id: 'route-receipt-ocr',
        taskName: 'document.ocr.receipt_scan',
        primaryModelId: 'mdl-paddle-v3',
        fallbackModelIds: ['mdl-qwen3-vl-4b'],
        promptVersion: 'ocr-v1.0',
        outputSchemaVersion: 'schema-receipt-v1',
        timeoutMs: 15000,
        maxDataClass: 'CUSTOMER_DOCUMENT',
        activeRolloutPercentage: 100,
      },
      {
        id: 'route-missing-info',
        taskName: 'return.missing_information',
        primaryModelId: 'mdl-qwen35-4b',
        fallbackModelIds: [],
        promptVersion: 'missing-info-v1.2',
        outputSchemaVersion: 'schema-tasks-v1',
        timeoutMs: 5000,
        maxDataClass: 'REDACTED_CUSTOMER',
        activeRolloutPercentage: 100,
      },
      {
        id: 'route-assessment-diff',
        taskName: 'assessment.compare_bulletin',
        primaryModelId: 'mdl-docling-v2',
        fallbackModelIds: ['mdl-qwen35-4b'],
        promptVersion: 'assessment-v1.0',
        outputSchemaVersion: 'schema-assessment-v1',
        timeoutMs: 8000,
        maxDataClass: 'CUSTOMER_DOCUMENT',
        activeRolloutPercentage: 100,
      },
    ];
  }

  getEvaluations(): readonly EvaluationRunDto[] {
    return [
      {
        id: 'eval-lux-golden-2025-1',
        modelId: 'mdl-docling-v2',
        datasetName: 'luxembourg-salary-golden-50',
        totalExamples: 50,
        exactMatchRate: 0.98,
        schemaValidRate: 1.0,
        hallucinationRate: 0.0,
        avgLatencyMs: 1420,
        evaluationDate: '2026-09-20',
        passedThreshold: true,
      },
      {
        id: 'eval-lux-golden-2025-2',
        modelId: 'mdl-paddle-v3',
        datasetName: 'luxembourg-scans-golden-30',
        totalExamples: 30,
        exactMatchRate: 0.94,
        schemaValidRate: 1.0,
        hallucinationRate: 0.0,
        avgLatencyMs: 2310,
        evaluationDate: '2026-09-21',
        passedThreshold: true,
      },
      {
        id: 'eval-lux-golden-2025-3',
        modelId: 'mdl-qwen35-4b',
        datasetName: 'luxembourg-reasoning-golden-40',
        totalExamples: 40,
        exactMatchRate: 0.96,
        schemaValidRate: 0.99,
        hallucinationRate: 0.01,
        avgLatencyMs: 890,
        evaluationDate: '2026-09-22',
        passedThreshold: true,
      },
    ];
  }

  async getAdminAudit(limit = 50, offset = 0): Promise<readonly AuditEventDto[]> {
    const events = await this.prisma.auditEvent.findMany({
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
    });

    return events.map((e) => ({
      id: e.id,
      householdId: e.householdId || undefined,
      workspaceId: e.workspaceId || undefined,
      actorId: e.actorId,
      actorEmail: e.actorEmail || undefined,
      eventType: e.eventType as unknown as AuditEventType,
      entityType: e.entityType,
      entityId: e.entityId,
      description: e.description,
      ipAddress: e.ipAddress || undefined,
      createdAt: e.createdAt.toISOString(),
    }));
  }
}
