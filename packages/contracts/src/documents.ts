import { DocumentType, DocumentStatus, DocumentVisibility } from './enums';

export interface DocumentDto {
  id: string;
  workspaceId: string;
  uploaderId: string;
  ownerId?: string | null;
  ownerEmail?: string | null;
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
  /** True when the file has no readable text and needs OCR or manual entry. */
  ocrRequired?: boolean;
  /** Which reader produced the text: a PDF text layer, text, or a vision model. */
  extractionSource?: 'TEXT_LAYER' | 'EMBEDDED_TEXT' | 'PLAIN_TEXT' | 'VISION' | 'OCR' | 'NONE';
  createdAt: string;
  updatedAt: string;
}

export interface UploadDocumentRequestDto {
  fileName: string;
  fileContentBase64: string;
  mimeType: string;
  ownerId?: string;
  documentType?: DocumentType;
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
