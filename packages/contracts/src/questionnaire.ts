import { TaskSeverity, TaskType } from './enums';

export interface QuestionnaireAnswersDto {
  maritalStatus: 'SINGLE' | 'MARRIED' | 'PACS' | 'DIVORCED' | 'WIDOWED';
  hasEmploymentIncome: boolean;
  hasPensionIncome: boolean;
  hasPrimaryResidenceMortgage: boolean;
  mortgageOccupancyYear?: number;
  hasLifeInsuranceOrPensionPlan: boolean;
  hasDonations: boolean;
  childrenCount: number;
  notes?: string;
}

export interface MissingInformationTaskDto {
  id: string;
  workspaceId: string;
  taskType: TaskType;
  severity: TaskSeverity;
  title: string;
  description: string;
  isResolved: boolean;
  assignedToUserId?: string | null;
  relatedDocumentType?: string | null;
  relatedFactId?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
}

export interface ReadinessDetailsDto {
  workspaceId: string;
  taxYear: number;
  completionScore: number; // 0 to 100
  totalTasks: number;
  unresolvedBlockers: number;
  unresolvedWarnings: number;
  tasks: MissingInformationTaskDto[];
}
