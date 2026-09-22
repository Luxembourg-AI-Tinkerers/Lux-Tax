import { DocumentType, DocumentStatus, DocumentVisibility } from './enums';

export interface DocumentDto {
  id: string;
  workspaceId: string;
  uploaderId: string;
  ownerId?: string | null;
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  sha256Hash: string;
  documentType: DocumentType;
  status: DocumentStatus;
  visibility: DocumentVisibility;
  pageCount?: number | null;
  taxYear: number;
  extractedFactsCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface UploadDocumentRequestDto {
  fileName: string;
  fileContentBase64: string;
  mimeType: string;
  ownerId?: string;
  visibility?: DocumentVisibility;
}

export interface DocumentExtractionDto {
  id: string;
  documentId: string;
  extractedText: string;
  confidence: number;
  rawJson?: any;
  createdAt: string;
}
