import { TaxClass, FilingRoute } from './enums';
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

export type ReturnVersionHistoryStatus = 'DRAFT' | 'APPROVED' | 'SUPERSEDED';

/**
 * One row of a workspace's return-version history. Unlike `ReturnVersionDto`,
 * the approvals array keeps superseded rows so the UI can explain why an
 * approval stopped counting.
 */
export interface ReturnVersionHistoryItemDto {
  /** Absent for the synthetic row of an active version that has no row yet. */
  id?: string;
  versionNumber: number;
  isCurrent: boolean;
  isFrozen: boolean;
  status: ReturnVersionHistoryStatus;
  /** Absent for the synthetic row: no ReturnVersion exists until approval. */
  createdAt?: string;
  /** Final tax liability from the approved calculation snapshot, in EUR. */
  finalTaxLiability?: number;
  packageGenerated: boolean;
  approvals: ReturnApprovalDto[];
}

export interface ReturnVersionHistoryDto {
  workspaceId: string;
  /** `TaxYearWorkspace.activeReturnVersion`, i.e. the version being edited. */
  activeReturnVersion: number;
  /** Newest first; always contains the active version, even before approval. */
  versions: ReturnVersionHistoryItemDto[];
}

export interface Form100BoxMapping {
  pageNumber: number;
  /** Letter code of the official 100F sheet, e.g. "S", "DS", "RD", "Enfants". */
  sheet: string;
  /**
   * Case number printed on that page of the official form (see
   * `form100-case-map.ts`). Computed credits have `caseNumber: "computed"`:
   * the ACD grants them itself, there is no 100F case to fill in.
   */
  caseNumber: string;
  /**
   * `FORM_100` when the taxpayer copies the amount onto the form; `COMPUTED`
   * for credits the ACD derives from the return; `INSTRUCTION` for a pointer to
   * a procedure rather than a case to copy (e.g. the foreign tax credit on
   * RD 1081/1082).
   */
  kind: 'FORM_100' | 'COMPUTED' | 'INSTRUCTION';
  labelFr: string;
  labelDe: string;
  amount: number | string;
  /** Owner of the fact behind the box, when it belongs to a household member (spouse cases). */
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

export interface AnnexRequestDto {
  /** ACD annex code, e.g. "190/210", "700", "104". */
  code: string;
  title: string;
  /** Why the annex is required for this return. */
  reason: string;
  /** Values the user must carry into the official annex. */
  fields: Array<{ label: string; value: string }>;
  /** False when the app supplies the data but does not generate the official PDF. */
  produced: boolean;
}

export interface FilingPackageDto {
  id: string;
  returnVersionId: string;
  taxYear: number;
  taxClass: TaxClass;
  generatedAt: string;
  form100Boxes: Form100BoxMapping[];
  /**
   * Certificate-160 codes found on a confirmed fact that the 160 table cannot
   * map (unknown code, or a withholding-base label such as FFO). Each entry
   * says why the fact did not reach the Form 100 map, so a silent drop is
   * impossible.
   */
  unsupportedCertificateCodes?: Array<{ code: string; factId: string; message: string }>;
  /** ACD annexes implied by the declared income and deductions. */
  annexes: AnnexRequestDto[];
  myGuichetGuide: MyGuichetStepGuide[];
  packageSha256: string;
}

/**
 * The user's declaration that the return was actually submitted. Exactly one
 * record exists per workspace: recording it freezes the return version, so a
 * later correction must start an amendment instead of editing this snapshot.
 */
export interface FilingRecordDto {
  id: string;
  workspaceId: string;
  returnVersionId: string;
  /** Version number of the frozen snapshot that was filed. */
  versionNumber?: number;
  /** Submission date, ISO `YYYY-MM-DD`. */
  filedAt: string;
  route: FilingRoute;
  /** ACD / MyGuichet receipt reference, when the channel issues one. */
  confirmationReference?: string | null;
  notes?: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  /** Always true for a filing record: the filed version is frozen. */
  isFrozen: boolean;
}

export interface CreateFilingRecordDto {
  /** Submission date, ISO `YYYY-MM-DD`. */
  filedAt: string;
  route: FilingRoute;
  confirmationReference?: string;
  notes?: string;
}

export interface UpdateAssessmentFollowUpDto {
  /** Last day to object, ISO `YYYY-MM-DD`. */
  objectionDeadline?: string;
  /** Internal follow-up date, ISO `YYYY-MM-DD`. */
  followUpAt?: string;
  /** Set once the assessment is final. */
  isFinal?: boolean;
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
  /** Date the ACD notice was received; absent on assessments imported before API-6. */
  receivedAt?: string | null;
  /** Last day to lodge an objection; absent on assessments imported before API-6. */
  objectionDeadline?: string | null;
  /** Internal follow-up date; absent on assessments imported before API-6. */
  followUpAt?: string | null;
  /** True once the assessment is final; absent means unknown/false. */
  isFinal?: boolean;
  createdAt: string;
}
