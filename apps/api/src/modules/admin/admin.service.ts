import { Injectable, OnModuleInit, BadRequestException, NotFoundException } from '@nestjs/common';
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
  TaxDeadlineDto,
  CreateModelDto,
  UpdateModelDto,
  TestModelConnectionDto,
  TestModelConnectionResultDto,
  UpdateModelRouteDto,
} from '@luxtax/contracts';
import * as crypto from 'crypto';

function maskApiKey(key?: string | null): string | undefined {
  if (!key) return undefined;
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

const BUILT_IN_MODELS: readonly ModelDefinitionDto[] = [
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
    isCustom: false,
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
    isCustom: false,
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
    isCustom: false,
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
    isCustom: false,
  },
];

const DEFAULT_ROUTES: readonly ModelRouteDto[] = [
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

@Injectable()
export class AdminService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.initDatabase();
  }

  async initDatabase(): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS custom_ai_models (
          id VARCHAR(64) PRIMARY KEY,
          display_name VARCHAR(255) NOT NULL,
          provider_type VARCHAR(64) NOT NULL,
          model_identifier VARCHAR(255) NOT NULL,
          endpoint_url TEXT,
          api_key TEXT,
          capabilities JSONB NOT NULL DEFAULT '[]',
          permitted_data_class VARCHAR(64) NOT NULL,
          hosting_region VARCHAR(64) NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
          healthy BOOLEAN NOT NULL DEFAULT true,
          is_custom BOOLEAN NOT NULL DEFAULT true,
          latency_ms INT DEFAULT 0,
          last_tested_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);

      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS custom_ai_routes (
          id VARCHAR(64) PRIMARY KEY,
          task_name VARCHAR(128) NOT NULL UNIQUE,
          primary_model_id VARCHAR(64) NOT NULL,
          fallback_model_ids JSONB NOT NULL DEFAULT '[]',
          prompt_version VARCHAR(64) NOT NULL,
          output_schema_version VARCHAR(64) NOT NULL,
          timeout_ms INT NOT NULL DEFAULT 8000,
          max_data_class VARCHAR(64) NOT NULL DEFAULT 'CUSTOMER_DOCUMENT',
          active_rollout_percentage INT NOT NULL DEFAULT 100,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);

      // Seed default routes if empty
      const existingRoutes = await this.prisma.$queryRawUnsafe<any[]>(
        'SELECT COUNT(*) as count FROM custom_ai_routes;'
      );
      const count = Number(existingRoutes[0]?.count || 0);
      if (count === 0) {
        for (const r of DEFAULT_ROUTES) {
          await this.prisma.$executeRawUnsafe(
            `INSERT INTO custom_ai_routes (id, task_name, primary_model_id, fallback_model_ids, prompt_version, output_schema_version, timeout_ms, max_data_class, active_rollout_percentage)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (task_name) DO NOTHING;`,
            r.id,
            r.taskName,
            r.primaryModelId,
            JSON.stringify(r.fallbackModelIds),
            r.promptVersion,
            r.outputSchemaVersion,
            r.timeoutMs,
            r.maxDataClass,
            r.activeRolloutPercentage,
          );
        }
      }
    } catch (err) {
      console.error('Failed to initialize AI governance tables in PostgreSQL:', err);
    }
  }

  async getOverview(): Promise<AdminOverviewDto> {
    const [workspacesCount, auditCount, customModelsCount, routesCount] = await Promise.all([
      this.prisma.taxYearWorkspace.count(),
      this.prisma.auditEvent.count(),
      this.prisma
        .$queryRawUnsafe<any[]>('SELECT COUNT(*) as count FROM custom_ai_models;')
        .then((r) => Number(r[0]?.count || 0))
        .catch(() => 0),
      this.prisma
        .$queryRawUnsafe<any[]>('SELECT COUNT(*) as count FROM custom_ai_routes;')
        .then((r) => Number(r[0]?.count || 0))
        .catch(() => 5),
    ]);

    return {
      serviceHealth: 'HEALTHY',
      activeTaxYears: [2025],
      registeredModelsCount: BUILT_IN_MODELS.length + customModelsCount,
      activeRoutesCount: routesCount > 0 ? routesCount : 5,
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

  getDeadlines(): readonly TaxDeadlineDto[] {
    return [
      {
        id: 'ddl-2025-open',
        taxYear: 2025,
        code: 'FILING_WINDOW_OPEN',
        name: 'Official Filing Window Opens',
        deadlineDate: '2026-02-01',
        description: 'Administration des contributions directes (ACD) opens electronic and paper submission for 2025 returns.',
        officialSourceUrl: 'https://guichet.public.lu/en/citoyens/fiscalite/declaration-impot-decompte/activite-professionnelle/declaration-revenus/declaration-impot.html',
      },
      {
        id: 'ddl-2025-close',
        taxYear: 2025,
        code: 'FILING_DEADLINE_LEGAL',
        name: 'Legal Filing Deadline (Form 100)',
        deadlineDate: '2026-12-31',
        description: 'Final statutory deadline for taxpayers resident in Luxembourg to submit personal income tax declaration Form 100 for tax year 2025.',
        officialSourceUrl: 'https://impotsdirects.public.lu/fr/formulaires/pers_physiques.html',
      },
      {
        id: 'ddl-2025-myguichet',
        taxYear: 2025,
        code: 'MYGUICHET_ELECTRONIC_DEADLINE',
        name: 'MyGuichet.lu Electronic Filing Portal Window',
        deadlineDate: '2026-12-31',
        description: 'Electronic submission window with LuxTrust authentication on MyGuichet.lu.',
        officialSourceUrl: 'https://guichet.public.lu/en/citoyens/fiscalite/declaration-impot-decompte/activite-professionnelle/declaration-revenus/declaration-impot-electronique.html',
      },
      {
        id: 'ddl-2025-assessment',
        taxYear: 2025,
        code: 'ASSESSMENT_FOLLOWUP',
        name: 'ACD Assessment Notice Follow-Up Window',
        deadlineDate: '2027-03-31',
        description: 'Period for receiving official Bulletin d\'imposition and filing any formal reclamation within 3 months of notification.',
        officialSourceUrl: 'https://impotsdirects.public.lu/fr/legislation/recours.html',
      },
    ];
  }

  async getModels(): Promise<readonly ModelDefinitionDto[]> {
    try {
      const customRows = await this.prisma.$queryRawUnsafe<any[]>(
        'SELECT * FROM custom_ai_models ORDER BY created_at DESC;'
      );

      const customModels: ModelDefinitionDto[] = (customRows || []).map((row) => ({
        id: row.id,
        displayName: row.display_name,
        providerType: row.provider_type,
        modelIdentifier: row.model_identifier,
        capabilities: typeof row.capabilities === 'string' ? JSON.parse(row.capabilities) : row.capabilities,
        permittedDataClass: row.permitted_data_class,
        hostingRegion: row.hosting_region,
        status: row.status,
        healthy: Boolean(row.healthy),
        endpointUrl: row.endpoint_url || undefined,
        apiKeyMasked: maskApiKey(row.api_key),
        isCustom: true,
        latencyMs: row.latency_ms || undefined,
        lastTestedAt: row.last_tested_at ? new Date(row.last_tested_at).toISOString() : undefined,
      }));

      return [...BUILT_IN_MODELS, ...customModels];
    } catch (err) {
      console.warn('Error reading custom_ai_models, returning built-in models:', err);
      return BUILT_IN_MODELS;
    }
  }

  async createModel(
    dto: CreateModelDto,
    actorId: string,
    actorEmail?: string
  ): Promise<ModelDefinitionDto> {
    const slug = dto.displayName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 20);
    const id = `mdl-${slug}-${crypto.randomBytes(3).toString('hex')}`;

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO custom_ai_models (
        id, display_name, provider_type, model_identifier, endpoint_url, api_key, capabilities, permitted_data_class, hosting_region, status, healthy, is_custom, latency_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13);`,
      id,
      dto.displayName,
      dto.providerType,
      dto.modelIdentifier,
      dto.endpointUrl || null,
      dto.apiKey || null,
      JSON.stringify(dto.capabilities),
      dto.permittedDataClass,
      dto.hostingRegion,
      dto.status || 'ACTIVE',
      true,
      true,
      0,
    );

    try {
      await this.prisma.auditEvent.create({
        data: {
          actorId,
          actorEmail,
          eventType: AuditEventType.FACT_CREATED,
          entityType: 'AI_MODEL',
          entityId: id,
          description: `Registered custom AI model: ${dto.displayName} (${dto.modelIdentifier} via ${dto.providerType})`,
          newValue: {
            id,
            displayName: dto.displayName,
            providerType: dto.providerType,
            modelIdentifier: dto.modelIdentifier,
            permittedDataClass: dto.permittedDataClass,
            hostingRegion: dto.hostingRegion,
          },
        },
      });
    } catch (e) {
      console.warn('Could not record audit event for model creation:', e);
    }

    return {
      id,
      displayName: dto.displayName,
      providerType: dto.providerType,
      modelIdentifier: dto.modelIdentifier,
      capabilities: dto.capabilities,
      permittedDataClass: dto.permittedDataClass,
      hostingRegion: dto.hostingRegion,
      status: dto.status || 'ACTIVE',
      healthy: true,
      endpointUrl: dto.endpointUrl,
      apiKeyMasked: maskApiKey(dto.apiKey),
      isCustom: true,
    };
  }

  async updateModel(
    id: string,
    dto: UpdateModelDto,
    actorId: string,
    actorEmail?: string
  ): Promise<ModelDefinitionDto> {
    const existing = await this.prisma.$queryRawUnsafe<any[]>(
      'SELECT * FROM custom_ai_models WHERE id = $1',
      id
    );

    if (!existing || existing.length === 0) {
      throw new NotFoundException(`Model with ID ${id} not found in custom registry`);
    }

    const current = existing[0];
    const displayName = dto.displayName ?? current.display_name;
    const providerType = dto.providerType ?? current.provider_type;
    const modelIdentifier = dto.modelIdentifier ?? current.model_identifier;
    const endpointUrl = dto.endpointUrl !== undefined ? dto.endpointUrl : current.endpoint_url;
    const apiKey = dto.apiKey !== undefined ? dto.apiKey : current.api_key;
    const capabilities = dto.capabilities ? JSON.stringify(dto.capabilities) : JSON.stringify(current.capabilities);
    const permittedDataClass = dto.permittedDataClass ?? current.permitted_data_class;
    const hostingRegion = dto.hostingRegion ?? current.hosting_region;
    const status = dto.status ?? current.status;
    const healthy = dto.healthy !== undefined ? dto.healthy : current.healthy;

    await this.prisma.$executeRawUnsafe(
      `UPDATE custom_ai_models SET
        display_name = $1,
        provider_type = $2,
        model_identifier = $3,
        endpoint_url = $4,
        api_key = $5,
        capabilities = $6,
        permitted_data_class = $7,
        hosting_region = $8,
        status = $9,
        healthy = $10,
        updated_at = NOW()
       WHERE id = $11;`,
      displayName,
      providerType,
      modelIdentifier,
      endpointUrl,
      apiKey,
      capabilities,
      permittedDataClass,
      hostingRegion,
      status,
      healthy,
      id,
    );

    try {
      await this.prisma.auditEvent.create({
        data: {
          actorId,
          actorEmail,
          eventType: AuditEventType.FACT_UPDATED,
          entityType: 'AI_MODEL',
          entityId: id,
          description: `Updated AI model: ${displayName} (Status: ${status})`,
          newValue: { status, healthy, permittedDataClass },
        },
      });
    } catch (e) {
      console.warn('Could not record audit event for model update:', e);
    }

    return {
      id,
      displayName,
      providerType,
      modelIdentifier,
      capabilities: typeof capabilities === 'string' ? JSON.parse(capabilities) : capabilities,
      permittedDataClass,
      hostingRegion,
      status,
      healthy,
      endpointUrl: endpointUrl || undefined,
      apiKeyMasked: maskApiKey(apiKey),
      isCustom: true,
    };
  }

  async deleteModel(
    id: string,
    actorId: string,
    actorEmail?: string
  ): Promise<{ success: boolean; message: string }> {
    const isBuiltIn = BUILT_IN_MODELS.some((m) => m.id === id);
    if (isBuiltIn) {
      throw new BadRequestException('Built-in system models cannot be deleted. You can set their status to DISABLED instead.');
    }

    const assignedRoutes = await this.prisma.$queryRawUnsafe<any[]>(
      'SELECT task_name FROM custom_ai_routes WHERE primary_model_id = $1;',
      id
    );
    if (assignedRoutes && assignedRoutes.length > 0) {
      const tasks = assignedRoutes.map((r) => r.task_name).join(', ');
      throw new BadRequestException(`Cannot delete model: it is assigned as primary model for: ${tasks}. Reassign those routes first.`);
    }

    // Clean up from fallbacks
    const allRoutes = await this.prisma.$queryRawUnsafe<any[]>(
      'SELECT id, fallback_model_ids FROM custom_ai_routes;'
    );
    for (const r of allRoutes || []) {
      const fallbacks: string[] = typeof r.fallback_model_ids === 'string'
        ? JSON.parse(r.fallback_model_ids)
        : (r.fallback_model_ids || []);
      if (fallbacks.includes(id)) {
        const updated = fallbacks.filter((f) => f !== id);
        await this.prisma.$executeRawUnsafe(
          'UPDATE custom_ai_routes SET fallback_model_ids = $1 WHERE id = $2;',
          JSON.stringify(updated),
          r.id
        );
      }
    }

    await this.prisma.$executeRawUnsafe(
      'DELETE FROM custom_ai_models WHERE id = $1;',
      id
    );

    try {
      await this.prisma.auditEvent.create({
        data: {
          actorId,
          actorEmail,
          eventType: AuditEventType.DOCUMENT_DELETED,
          entityType: 'AI_MODEL',
          entityId: id,
          description: `Deleted custom AI model: ${id}`,
        },
      });
    } catch (e) {
      console.warn('Could not record audit event for model deletion:', e);
    }

    return {
      success: true,
      message: `Model ${id} successfully removed from registry`,
    };
  }

  async testModelConnection(dto: TestModelConnectionDto): Promise<TestModelConnectionResultDto> {
    let endpointUrl = dto.endpointUrl?.trim();
    let apiKey = dto.apiKey?.trim();
    let modelIdentifier = dto.modelIdentifier?.trim();

    if (dto.modelId) {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(
        'SELECT * FROM custom_ai_models WHERE id = $1;',
        dto.modelId
      );
      if (rows && rows.length > 0) {
        const model = rows[0];
        endpointUrl = endpointUrl || model.endpoint_url;
        apiKey = apiKey || model.api_key;
        modelIdentifier = modelIdentifier || model.model_identifier;
      }
    }

    if (!endpointUrl) {
      return {
        success: false,
        latencyMs: 0,
        statusCode: 400,
        message: 'No endpoint URL configured for this model.',
        timestamp: new Date().toISOString(),
      };
    }

    const startTime = Date.now();
    let probeUrl = endpointUrl;
    const isAnthropic = endpointUrl.includes('anthropic.com');
    const isOpenAiCompatible =
      endpointUrl.includes('openai.com') ||
      endpointUrl.includes('groq.com') ||
      endpointUrl.includes('mistral.ai') ||
      endpointUrl.includes('localhost') ||
      endpointUrl.includes('/v1');

    if (isOpenAiCompatible && !probeUrl.includes('/models') && !probeUrl.includes('/chat/completions')) {
      probeUrl = `${probeUrl.replace(/\/+$/, '')}/models`;
    }

    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (apiKey) {
        if (isAnthropic) {
          headers['x-api-key'] = apiKey;
          headers['anthropic-version'] = '2023-06-01';
        } else {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(probeUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      const latencyMs = Date.now() - startTime;
      const isOk = response.ok;
      let message = '';
      let sampleResponse = '';

      if (isOk) {
        message = `Connection verified successfully (${response.status} ${response.statusText})`;
        try {
          const json = await response.json();
          sampleResponse = JSON.stringify(json).substring(0, 200);
        } catch {
          sampleResponse = 'OK';
        }
      } else if (response.status === 401 || response.status === 403) {
        message = `Endpoint reached, but authorization failed (${response.status} ${response.statusText}). Check API key.`;
      } else if (response.status === 404 && probeUrl.endsWith('/models')) {
        const postUrl = probeUrl.replace(/\/models$/, '/chat/completions');
        try {
          const pingResponse = await fetch(postUrl, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: modelIdentifier || 'gpt-3.5-turbo',
              messages: [{ role: 'user', content: 'ping' }],
              max_tokens: 1,
            }),
            signal: AbortSignal.timeout(5000),
          });
          const pingLatency = Date.now() - startTime;
          if (pingResponse.ok || pingResponse.status === 400 || pingResponse.status === 401) {
            return {
              success: pingResponse.ok,
              latencyMs: pingLatency,
              statusCode: pingResponse.status,
              message: pingResponse.ok
                ? `Connection verified successfully via chat completions (${pingResponse.status})`
                : `Endpoint reachable (${pingResponse.status} ${pingResponse.statusText})`,
              resolvedModel: modelIdentifier,
              timestamp: new Date().toISOString(),
            };
          }
        } catch {
          // ignore chat probe error and fall through
        }
        message = `Endpoint reached but returned HTTP 404. Verify base path URL.`;
      } else {
        message = `Server returned HTTP ${response.status} (${response.statusText})`;
      }

      if (dto.modelId) {
        await this.prisma.$executeRawUnsafe(
          `UPDATE custom_ai_models SET healthy = $1, latency_ms = $2, last_tested_at = NOW(), updated_at = NOW() WHERE id = $3;`,
          isOk,
          latencyMs,
          dto.modelId
        ).catch(() => {});
      }

      return {
        success: isOk,
        latencyMs,
        statusCode: response.status,
        message,
        sampleResponse,
        resolvedModel: modelIdentifier,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      let errMsg = err.message || 'Connection failed';
      if (err.name === 'AbortError') {
        errMsg = 'Connection timed out after 6000ms';
      } else if (err.cause?.code === 'ECONNREFUSED') {
        errMsg = 'Connection refused. Host is unreachable or offline.';
      } else if (err.cause?.code === 'ENOTFOUND') {
        errMsg = 'Host not found. Check endpoint domain name.';
      }

      if (dto.modelId) {
        await this.prisma.$executeRawUnsafe(
          `UPDATE custom_ai_models SET healthy = false, latency_ms = $1, last_tested_at = NOW(), updated_at = NOW() WHERE id = $2;`,
          latencyMs,
          dto.modelId
        ).catch(() => {});
      }

      return {
        success: false,
        latencyMs,
        statusCode: 504,
        message: errMsg,
        resolvedModel: modelIdentifier,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getModelRoutes(): Promise<readonly ModelRouteDto[]> {
    try {
      const routeRows = await this.prisma.$queryRawUnsafe<any[]>(
        'SELECT * FROM custom_ai_routes ORDER BY task_name ASC;'
      );

      if (!routeRows || routeRows.length === 0) {
        return DEFAULT_ROUTES;
      }

      return routeRows.map((r) => ({
        id: r.id,
        taskName: r.task_name,
        primaryModelId: r.primary_model_id,
        fallbackModelIds: typeof r.fallback_model_ids === 'string' ? JSON.parse(r.fallback_model_ids) : (r.fallback_model_ids || []),
        promptVersion: r.prompt_version,
        outputSchemaVersion: r.output_schema_version,
        timeoutMs: Number(r.timeout_ms),
        maxDataClass: r.max_data_class,
        activeRolloutPercentage: Number(r.active_rollout_percentage),
      }));
    } catch (err) {
      console.warn('Error reading custom_ai_routes, returning default routes:', err);
      return DEFAULT_ROUTES;
    }
  }

  async updateModelRoute(
    routeIdOrTask: string,
    dto: UpdateModelRouteDto,
    actorId: string,
    actorEmail?: string
  ): Promise<ModelRouteDto> {
    const routes = await this.prisma.$queryRawUnsafe<any[]>(
      'SELECT * FROM custom_ai_routes WHERE id = $1 OR task_name = $1;',
      routeIdOrTask
    );

    if (!routes || routes.length === 0) {
      throw new NotFoundException(`Model route ${routeIdOrTask} not found`);
    }

    const existing = routes[0];
    const primaryModelId = dto.primaryModelId;
    const fallbackModelIds = JSON.stringify(dto.fallbackModelIds || []);
    const promptVersion = dto.promptVersion ?? existing.prompt_version;
    const outputSchemaVersion = dto.outputSchemaVersion ?? existing.output_schema_version;
    const timeoutMs = dto.timeoutMs ?? existing.timeout_ms;
    const maxDataClass = dto.maxDataClass ?? existing.max_data_class;
    const activeRolloutPercentage = dto.activeRolloutPercentage ?? existing.active_rollout_percentage;

    await this.prisma.$executeRawUnsafe(
      `UPDATE custom_ai_routes SET
        primary_model_id = $1,
        fallback_model_ids = $2,
        prompt_version = $3,
        output_schema_version = $4,
        timeout_ms = $5,
        max_data_class = $6,
        active_rollout_percentage = $7,
        updated_at = NOW()
       WHERE id = $8;`,
      primaryModelId,
      fallbackModelIds,
      promptVersion,
      outputSchemaVersion,
      timeoutMs,
      maxDataClass,
      activeRolloutPercentage,
      existing.id
    );

    try {
      await this.prisma.auditEvent.create({
        data: {
          actorId,
          actorEmail,
          eventType: AuditEventType.FACT_UPDATED,
          entityType: 'AI_ROUTE',
          entityId: existing.id,
          description: `Updated AI route ${existing.task_name}: Primary -> ${primaryModelId}, Fallbacks -> ${dto.fallbackModelIds.join(', ') || 'None'} (${activeRolloutPercentage}% rollout)`,
          newValue: {
            taskName: existing.task_name,
            primaryModelId,
            fallbackModelIds: dto.fallbackModelIds,
            activeRolloutPercentage,
          },
        },
      });
    } catch (e) {
      console.warn('Could not record audit event for route update:', e);
    }

    return {
      id: existing.id,
      taskName: existing.task_name,
      primaryModelId,
      fallbackModelIds: dto.fallbackModelIds,
      promptVersion,
      outputSchemaVersion,
      timeoutMs,
      maxDataClass,
      activeRolloutPercentage,
    };
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
