import { FactCategory } from './enums';

export interface ExtractedFactDto {
  id: string;
  documentId: string;
  workspaceId: string;
  ownerId?: string | null;
  fieldName: string;
  fieldValue: string;
  currency: string;
  confidence: number;
  sourcePage?: number | null;
  sourceSnippet?: string | null;
  isConfirmed: boolean;
  confirmedAt?: string | null;
  confirmedById?: string | null;
  createdAt: string;
}

export interface ConfirmedFactDto {
  id: string;
  workspaceId: string;
  ownerId?: string | null;
  category: FactCategory;
  fieldKey: string;
  amount: string;
  currency: string;
  taxYear: number;
  sourceDocumentId?: string | null;
  extractedFactId?: string | null;
  isSharedWithHousehold: boolean;
  isIncludedInReturn: boolean;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConfirmFactRequestDto {
  extractedFactId?: string;
  ownerId?: string | null;
  category: FactCategory;
  fieldKey: string;
  amount: string;
  currency?: string;
  isSharedWithHousehold?: boolean;
  isIncludedInReturn?: boolean;
  description?: string;
}

export interface UpdateFactRequestDto {
  amount?: string;
  ownerId?: string | null;
  category?: FactCategory;
  isSharedWithHousehold?: boolean;
  isIncludedInReturn?: boolean;
  description?: string;
}
