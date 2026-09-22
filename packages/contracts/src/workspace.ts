import { WorkspaceStatus, TaxResidence, TaxClass } from './enums';

export interface TaxYearWorkspaceDto {
  readonly id: string;
  readonly householdId: string;
  readonly taxYear: number;
  readonly status: WorkspaceStatus;
  readonly completionScore: number;
  readonly activeReturnVersion: number;
  readonly residenceStatus: TaxResidence;
  readonly taxClass?: TaxClass;
  readonly estimatedTaxBalance?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface InitWorkspaceDto {
  readonly taxYear: number;
  readonly residenceStatus?: TaxResidence;
  readonly taxClass?: TaxClass;
}

export interface WorkspaceReadinessDto {
  readonly workspaceId: string;
  readonly overallPercentage: number;
  readonly memberReadiness: {
    readonly [memberId: string]: number;
  };
  readonly criticalWarningsCount: number;
  readonly missingDocumentsCount: number;
  readonly unconfirmedFactsCount: number;
  readonly canCalculate: boolean;
  readonly canApprove: boolean;
}
