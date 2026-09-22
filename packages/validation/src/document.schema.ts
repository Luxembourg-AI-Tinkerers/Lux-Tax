import { z } from 'zod';
import { DocumentType, DocumentVisibility } from '@luxtax/contracts';

export const uploadDocumentSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileContentBase64: z.string().min(1, 'File content cannot be empty'),
  mimeType: z.string().refine(
    (mime) =>
      [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        'text/plain',
      ].includes(mime),
    { message: 'Unsupported file type. Only PDF and JPEG/PNG images are allowed.' },
  ),
  ownerId: z.string().uuid().optional(),
  visibility: z.nativeEnum(DocumentVisibility).default(DocumentVisibility.PRIVATE_DRAFT),
});

export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;
