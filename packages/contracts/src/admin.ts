export interface TaxRulePackageDto {
  readonly id: string;
  readonly taxYear: number;
  readonly version: string;
  readonly effectiveDate: string;
  readonly progressiveScaleBrackets: number;
  readonly splittingMethodEnabled: boolean;
  readonly standardDeductionFrais: string;
  readonly primaryResidenceMortgageCap: string;
  readonly specialExpensesForfait: string;
  readonly legalSourceUrls: readonly string[];
  readonly packageChecksum: string;
  readonly status: 'ACTIVE' | 'DRAFT' | 'DEPRECATED';
}

export interface FormMappingDto {
  readonly id: string;
  readonly formCode: string;
  readonly taxYear: number;
  readonly version: string;
  readonly boxMappings: readonly {
    readonly boxNumber: string;
    readonly fieldName: string;
    readonly description: string;
  }[];
}

export interface ModelDefinitionDto {
  readonly id: string;
  readonly displayName: string;
  readonly providerType: 'LOCAL' | 'PRIVATE_CLOUD' | 'HOSTED';
  readonly modelIdentifier: string;
  readonly capabilities: readonly ('TEXT' | 'VISION' | 'EMBEDDING' | 'RERANKING')[];
  readonly permittedDataClass: 'PUBLIC' | 'SYNTHETIC' | 'REDACTED_CUSTOMER' | 'CUSTOMER_DOCUMENT';
  readonly hostingRegion: string;
  readonly status: 'ACTIVE' | 'CANARY' | 'DISABLED';
  readonly healthy: boolean;
}

export interface ModelRouteDto {
  readonly id: string;
  readonly taskName: string;
  readonly primaryModelId: string;
  readonly fallbackModelIds: readonly string[];
  readonly promptVersion: string;
  readonly outputSchemaVersion: string;
  readonly timeoutMs: number;
  readonly maxDataClass: string;
  readonly activeRolloutPercentage: number;
}

export interface EvaluationRunDto {
  readonly id: string;
  readonly modelId: string;
  readonly datasetName: string;
  readonly totalExamples: number;
  readonly exactMatchRate: number;
  readonly schemaValidRate: number;
  readonly hallucinationRate: number;
  readonly avgLatencyMs: number;
  readonly evaluationDate: string;
  readonly passedThreshold: boolean;
}

export interface AdminOverviewDto {
  readonly serviceHealth: 'HEALTHY' | 'DEGRADED';
  readonly activeTaxYears: readonly number[];
  readonly registeredModelsCount: number;
  readonly activeRoutesCount: number;
  readonly totalWorkspaces: number;
  readonly totalAuditEvents: number;
}

export interface TaxDeadlineDto {
  readonly id: string;
  readonly taxYear: number;
  readonly code: 'FILING_WINDOW_OPEN' | 'FILING_DEADLINE_LEGAL' | 'MYGUICHET_ELECTRONIC_DEADLINE' | 'ASSESSMENT_FOLLOWUP';
  readonly name: string;
  readonly deadlineDate: string;
  readonly description: string;
  readonly officialSourceUrl: string;
}

