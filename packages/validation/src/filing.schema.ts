import { z } from 'zod';
import { FilingRoute } from '@luxtax/contracts';

export const approveReturnSchema = z.object({
  returnVersionId: z.string().uuid(),
});

export const importAssessmentSchema = z.object({
  taxYear: z.number().int().min(2020).max(2030),
  bulletinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Bulletin date must be YYYY-MM-DD'),
  assessedTaxableIncome: z.string().regex(/^-?\d+(\.\d{1,2})?$/),
  assessedTaxDue: z.string().regex(/^-?\d+(\.\d{1,2})?$/),
  notes: z.string().max(1000).optional(),
  // Optional overrides; when omitted the API derives both dates from the
  // bulletin date (objection +3 months, follow-up +30 days).
  objectionDeadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Objection deadline must be YYYY-MM-DD')
    .optional(),
  followUpAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Follow-up date must be YYYY-MM-DD')
    .optional(),
  isFinal: z.boolean().optional(),
});

export const createFilingRecordSchema = z.object({
  filedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Filing date must be YYYY-MM-DD'),
  route: z.nativeEnum(FilingRoute),
  confirmationReference: z.string().max(120).optional(),
  notes: z.string().max(1000).optional(),
});

export const updateAssessmentFollowUpSchema = z.object({
  objectionDeadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Objection deadline must be YYYY-MM-DD')
    .optional(),
  followUpAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Follow-up date must be YYYY-MM-DD')
    .optional(),
  isFinal: z.boolean().optional(),
});

export type ApproveReturnInput = z.infer<typeof approveReturnSchema>;
export type ImportAssessmentInput = z.infer<typeof importAssessmentSchema>;
export type CreateFilingRecordInput = z.infer<typeof createFilingRecordSchema>;
export type UpdateAssessmentFollowUpInput = z.infer<typeof updateAssessmentFollowUpSchema>;
