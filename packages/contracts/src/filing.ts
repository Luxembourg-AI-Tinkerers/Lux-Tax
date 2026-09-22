import { TaxClass } from './enums';
import { TaxCalculationResultDto } from './tax';
import { ConfirmedFactDto } from './facts';

export interface ReturnApprovalDto {
  id: string;
  returnVersionId: string;
  userId: string;
  userEmail?: string;
  approvedAt: string;
  isSuperseded: boolean;
  supersededAt?: string | null;
  supersedingReason?: string | null;
}

export interface ReturnVersionDto {
  id: string;
  workspaceId: string;
  versionNumber: number;
  isFrozen: boolean;
  factsSnapshot: ConfirmedFactDto[];
  calculationSnapshot: TaxCalculationResultDto;
  approvals: ReturnApprovalDto[];
  bothSpousesApproved: boolean;
  createdAt: string;
}

export interface Form100BoxMapping {
  pageNumber: number;
  boxNumber: string;
  labelFr: string;
  labelDe: string;
  amount: number | string;
  personName?: string;
  sourceFactId?: string;
}

export interface MyGuichetStepGuide {
  sectionIndex: number;
  sectionTitle: string;
  instructions: string[];
  fieldsToEnter: Array<{
    fieldLabel: string;
    form100Box: string;
    value: string | number;
  }>;
}

export interface FilingPackageDto {
  id: string;
  returnVersionId: string;
  taxYear: number;
  taxClass: TaxClass;
  generatedAt: string;
  form100Boxes: Form100BoxMapping[];
  myGuichetGuide: MyGuichetStepGuide[];
  packageSha256: string;
}

export interface AssessmentComparisonDiscrepancy {
  field: string;
  declaredValue: number;
  assessedValue: number;
  difference: number;
  notes: string;
}

export interface AssessmentDto {
  id: string;
  workspaceId: string;
  taxYear: number;
  bulletinDate: string;
  assessedTaxableIncome: number;
  assessedTaxDue: number;
  differenceWithDeclared: number;
  discrepancies: AssessmentComparisonDiscrepancy[];
  createdAt: string;
}
